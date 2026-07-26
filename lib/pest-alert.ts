/**
 * Pest-outbreak geo-alerts.
 *
 * When a crop photo is confirmed as a pest/disease, we alert every registered
 * farmer within a small radius (default 3 km) of the reporting farmer's land,
 * over WhatsApp, with prevention tips. Recipients reply:
 *   - "no pest"  → they're suppressed for that pest (cooldown)
 *   - "have it"  → a new outbreak point is created at THEIR field, which alerts
 *                  their neighbours (the outbreak zone expands).
 *
 * Two DynamoDB tables back this (see `Tables` in lib/aws/dynamodb.ts):
 *   pest_reports  — confirmed outbreak points (PK report_id)
 *   pest_alerts   — per-recipient state for exclusion + cooldown (PK farmer_id, SK pest_key)
 */
import { scanItems, getItem, putItem, queryItems, Tables } from './aws/dynamodb';
import { sendWhatsApp } from './whatsapp/twilio';
import { toIndiaPhone } from './phone';
import { extractCentroid, haversineKm, generateId } from './utils';
import { districtFromAddress } from './crop-suitability';
import type { Diagnosis } from './crop-doctor';

type LatLng = { lat: number; lng: number };
type Locale = 'en' | 'hi' | 'ta';
export type PestResponse = 'clear' | 'confirm';

const RADIUS_KM = Number(process.env.PEST_ALERT_RADIUS_KM) || 3;
const COOLDOWN_DAYS = Number(process.env.PEST_ALERT_COOLDOWN_DAYS) || 14;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

function pickLocale(value: unknown): Locale {
  const v = String(value ?? '');
  return v === 'hi' || v === 'ta' ? v : 'en';
}

function coordsOf(profile: Record<string, unknown> | null | undefined): LatLng | null {
  const coords = profile?.land_coordinates as LatLng[] | undefined;
  return coords?.length ? extractCentroid(coords) : null;
}

/** Stable key for a pest/disease so cooldown + dedup group the same problem. */
export function normalizePestKey(diagnosis: Pick<Diagnosis, 'diagnosis'>): string {
  return String(diagnosis.diagnosis ?? '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')      // drop parentheticals like "(fungal)"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'unknown-pest';
}

/** Only broadcast for a clearly diagnosed, non-trivial pest/disease. */
export function isConfirmedPest(diagnosis: Diagnosis | null | undefined): boolean {
  if (!diagnosis) return false;
  const confidence = String(diagnosis.confidence ?? '').toLowerCase();
  return diagnosis.isPlant === true
    && diagnosis.healthy === false
    && Boolean(diagnosis.diagnosis)
    && confidence !== 'low';
}

// ---------------------------------------------------------------------------
// Message composition + localisation
// ---------------------------------------------------------------------------
function cropWord(locale: Locale, crop?: string | null): string {
  if (crop && crop.trim()) return crop.trim();
  return locale === 'ta' ? 'உங்கள் பயிர்' : locale === 'hi' ? 'आपकी फसल' : 'your crop';
}

function composeAlert(
  locale: Locale,
  { pest, crop, distanceKm, tips }: { pest: string; crop: string; distanceKm: number; tips: string[] },
): string {
  const dist = distanceKm < 1 ? distanceKm.toFixed(1) : Math.round(distanceKm).toString();
  const bullets = tips.length ? tips.map((t) => `• ${t}`).join('\n') : '';
  if (locale === 'ta') {
    return `⚠️ உங்கள் வயலுக்கு அருகில் பூச்சி எச்சரிக்கை\n${crop} பயிரில் சுமார் ${dist} கி.மீ தொலைவில் *${pest}* கண்டறியப்பட்டது. இப்போதே உங்கள் பயிரைச் சரிபார்க்கவும்.`
      + (bullets ? `\n\nஉங்கள் பயிரைப் பாதுகாக்க:\n${bullets}` : '')
      + `\n\nபதில்: *1* = என் பயிர் நலமாக உள்ளது, *2* = இந்த பூச்சி என்னிடமும் உள்ளது.`;
  }
  if (locale === 'hi') {
    return `⚠️ आपके खेत के पास कीट चेतावनी\n${crop} में लगभग ${dist} किमी दूर *${pest}* मिला है। कृपया अभी अपनी फसल जांचें।`
      + (bullets ? `\n\nअपनी फसल बचाने के लिए:\n${bullets}` : '')
      + `\n\nजवाब दें: *1* = मेरी फसल ठीक है, *2* = मुझे भी यह कीट दिखा।`;
  }
  return `⚠️ Pest alert near your field\n*${pest}* was found in ${crop} about ${dist} km away. Please check your crop now.`
    + (bullets ? `\n\nTo protect your crop:\n${bullets}` : '')
    + `\n\nReply: *1* = my crop is fine, *2* = I see this pest too.`;
}

// ---------------------------------------------------------------------------
// Core broadcast
// ---------------------------------------------------------------------------
interface BroadcastInput {
  reporterId: string;
  reporterProfile: Record<string, unknown>;
  pestKey: string;
  pestLabel: string;
  cropName?: string | null;
  severity?: string | null;
  confidence?: string | null;
  prevention?: string[] | null;
  sourceLocale: Locale;
  s3Key?: string;
  /** Bypass the reporter-cooldown guard (used by the confirm/expand path). */
  force?: boolean;
}

async function broadcastPest(input: BroadcastInput): Promise<{ reportId: string | null; alerted: number; skipped?: string }> {
  const center = coordsOf(input.reporterProfile);
  if (!center) return { reportId: null, alerted: 0, skipped: 'no-coords' };

  // Reporter cooldown: don't re-broadcast the same pest from the same farmer
  // within the window (prevents re-upload spam). The confirm/expand path forces.
  if (!input.force) {
    const existing = await getItem(Tables.PEST_ALERTS, { farmer_id: input.reporterId, pest_key: input.pestKey });
    if (existing && Number(existing.cooldown_until ?? 0) > Date.now()) {
      return { reportId: null, alerted: 0, skipped: 'reporter-cooldown' };
    }
  }

  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const cooldownUntil = now + COOLDOWN_MS;
  const tips = (input.prevention ?? []).filter(Boolean).slice(0, 2);
  const district = districtFromAddress(input.reporterProfile.address as string | undefined) ?? '';

  // 1) Record the outbreak point.
  const reportId = generateId();
  await putItem(Tables.PEST_REPORTS, {
    report_id: reportId,
    farmer_id: input.reporterId,
    lat: center.lat,
    lng: center.lng,
    district,
    crop_name: input.cropName ?? '',
    pest_key: input.pestKey,
    pest_label: input.pestLabel,
    severity: input.severity ?? '',
    confidence: input.confidence ?? '',
    prevention: tips,
    radius_km: RADIUS_KM,
    s3_image_key: input.s3Key ?? '',
    source_locale: input.sourceLocale,
    status: 'active',
    created_at: nowIso,
    alerted_count: 0,
  });

  // 2) Find nearby registered farmers (excluding the reporter + those on cooldown).
  const farmers = await scanItems(Tables.FARMER_PROFILES);
  let alerted = 0;

  for (const f of farmers) {
    const fid = String(f.farmer_id ?? '');
    if (!fid || fid === input.reporterId || !f.phone) continue;
    const fCenter = coordsOf(f);
    if (!fCenter) continue;
    const dist = haversineKm(center, fCenter);
    if (dist > RADIUS_KM) continue;

    // Cooldown / exclusion: skip farmers already in the window for this pest.
    const prior = await getItem(Tables.PEST_ALERTS, { farmer_id: fid, pest_key: input.pestKey });
    if (prior && Number(prior.cooldown_until ?? 0) > now) continue;

    // composeAlert localises the scaffolding to the recipient's language; the
    // pest label/tips stay in the reporter's language (source_locale on the report).
    const locale = pickLocale(f.preferred_language);
    const msg = composeAlert(locale, {
      pest: input.pestLabel,
      crop: cropWord(locale, input.cropName),
      distanceKm: dist,
      tips,
    });

    console.log(`[PestAlert] alerting ${f.name ?? fid} (${f.phone}) ~${dist.toFixed(1)}km - ${input.pestKey}`);
    await sendWhatsApp(toIndiaPhone(String(f.phone)), msg);

    await putItem(Tables.PEST_ALERTS, {
      farmer_id: fid,
      pest_key: input.pestKey,
      report_id: reportId,
      status: 'pending',
      distance_km: Math.round(dist * 10) / 10,
      pest_label: input.pestLabel,
      crop_name: input.cropName ?? '',
      prevention: tips,
      alerted_at: nowIso,
      cooldown_until: cooldownUntil,
    });
    alerted += 1;
  }

  // 3) Mark the reporter as confirmed-for-this-pest so re-uploads don't re-blast.
  await putItem(Tables.PEST_ALERTS, {
    farmer_id: input.reporterId,
    pest_key: input.pestKey,
    report_id: reportId,
    status: 'confirmed',
    distance_km: 0,
    pest_label: input.pestLabel,
    crop_name: input.cropName ?? '',
    prevention: tips,
    alerted_at: nowIso,
    responded_at: nowIso,
    cooldown_until: cooldownUntil,
  });

  console.log(`[PestAlert] report ${reportId} (${input.pestKey}) alerted ${alerted} farmer(s) within ${RADIUS_KM}km`);
  return { reportId, alerted };
}

/** Auto-trigger from a crop-photo diagnosis (called by the chat engine). */
export async function maybeBroadcastFromDiagnosis(params: {
  reporterId: string;
  reporterProfile: Record<string, unknown> | null | undefined;
  diagnosis: Diagnosis | null | undefined;
  locale: Locale;
  s3Key?: string;
}): Promise<void> {
  const { diagnosis, reporterProfile } = params;
  if (!isConfirmedPest(diagnosis) || !reporterProfile) return;
  try {
    await broadcastPest({
      reporterId: params.reporterId,
      reporterProfile,
      pestKey: normalizePestKey(diagnosis!),
      pestLabel: String(diagnosis!.diagnosis),
      cropName: diagnosis!.cropName,
      severity: diagnosis!.severity,
      confidence: diagnosis!.confidence,
      prevention: diagnosis!.prevention,
      sourceLocale: params.locale,
      s3Key: params.s3Key,
    });
  } catch (e) {
    console.error('Pest alert broadcast failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Recipient responses + reads
// ---------------------------------------------------------------------------

/** Parse a farmer's reply to a pest alert. Returns null if it isn't a response. */
export function parsePestResponse(text: string): PestResponse | null {
  const t = text.trim().toLowerCase();
  if (t === '1') return 'clear';
  if (t === '2') return 'confirm';
  if (/^(no|no pest|clear|safe|fine|ok|healthy|nahi|illa|illai)\b/.test(t)) return 'clear';
  if (/^(yes|have|i have|same|found|haan|irukku|iruku)\b/.test(t)) return 'confirm';
  return null;
}

/** Most recent still-pending alert for a farmer (used to route WhatsApp replies). */
export async function findPendingAlert(farmerId: string): Promise<Record<string, unknown> | null> {
  const rows = await queryItems({
    TableName: Tables.PEST_ALERTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
  }).catch(() => []);
  const pending = rows
    .filter((r) => r.status === 'pending')
    .sort((a, b) => String(b.alerted_at).localeCompare(String(a.alerted_at)));
  return pending[0] ?? null;
}

/** All active (pending) alerts for a farmer, for the Today widget. */
export async function getPendingAlerts(farmerId: string): Promise<Array<{
  pestKey: string; pestLabel: string; cropName: string; distanceKm: number; prevention: string[];
}>> {
  const rows = await queryItems({
    TableName: Tables.PEST_ALERTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
  }).catch(() => []);
  return rows
    .filter((r) => r.status === 'pending')
    .sort((a, b) => String(b.alerted_at).localeCompare(String(a.alerted_at)))
    .map((r) => ({
      pestKey: String(r.pest_key),
      pestLabel: String(r.pest_label ?? r.pest_key),
      cropName: String(r.crop_name ?? ''),
      distanceKm: Number(r.distance_km ?? 0),
      prevention: Array.isArray(r.prevention) ? (r.prevention as string[]) : [],
    }));
}

/**
 * Handle a recipient's response.
 *  - 'clear'   → suppress this farmer for this pest (cooldown), no broadcast.
 *  - 'confirm' → mark confirmed and create a NEW outbreak point at this farmer's
 *                field, broadcasting to their neighbours (the zone expands).
 */
export async function respondToPestAlert(params: {
  farmerId: string;
  farmerProfile: Record<string, unknown>;
  pestKey: string;
  response: PestResponse;
}): Promise<{ ok: boolean; action?: PestResponse; spread?: number }> {
  const { farmerId, farmerProfile, pestKey, response } = params;
  const alert = await getItem(Tables.PEST_ALERTS, { farmer_id: farmerId, pest_key: pestKey });
  if (!alert) return { ok: false };

  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  if (response === 'clear') {
    await putItem(Tables.PEST_ALERTS, {
      ...alert,
      status: 'clear',
      responded_at: nowIso,
      cooldown_until: now + COOLDOWN_MS,
    });
    return { ok: true, action: 'clear' };
  }

  // confirm → expand from this farmer's field
  await putItem(Tables.PEST_ALERTS, { ...alert, status: 'confirmed', responded_at: nowIso });
  const report = alert.report_id
    ? await getItem(Tables.PEST_REPORTS, { report_id: String(alert.report_id) })
    : null;
  const locale = pickLocale(farmerProfile.preferred_language);
  const result = await broadcastPest({
    reporterId: farmerId,
    reporterProfile: farmerProfile,
    pestKey,
    pestLabel: String(alert.pest_label ?? report?.pest_label ?? pestKey),
    cropName: (report?.crop_name as string) ?? (alert.crop_name as string) ?? '',
    severity: (report?.severity as string) ?? '',
    confidence: (report?.confidence as string) ?? '',
    prevention: (report?.prevention as string[]) ?? (alert.prevention as string[]) ?? [],
    sourceLocale: locale,
    force: true,
  });
  return { ok: true, action: 'confirm', spread: result.alerted };
}
