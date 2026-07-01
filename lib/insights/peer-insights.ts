/**
 * Peer-insight engine.
 *
 * Clusters registered farmers by *similarity* — land-size class, soil family and
 * crop — NOT by geography, so a farmer can learn from a peer in another district
 * (cross-area knowledge transfer). For one recipient it then picks the single most
 * useful, GROUNDED, anonymised "a farmer like you did X" insight to push over
 * WhatsApp:
 *
 *   1. crop      — a crop that suits the recipient's land (crop-suitability engine)
 *                  AND is grown by a similar peer, that the recipient doesn't grow.
 *   2. scheme    — a government scheme the recipient is actually eligible/likely for
 *                  (scheme matcher), preferring ones similar peers also qualify for.
 *   3. practice  — a key agronomic tip for the recipient's current crop.
 *
 * The app stores no realised outcomes (yield/profit), so insights never claim a ₹
 * result a farmer "earned" — they surface real eligibility and real suitability.
 *
 * This module is pure (no DynamoDB / network): the cron route loads the data,
 * builds the pool, and persists the dedupe rows. Composition is deterministic.
 */
import { landSizeClass, matchSchemes } from '@/lib/schemes/match';
import { buildFarmerFacts } from '@/lib/schemes/facts';
import { snippet } from '@/lib/schemes/format';
import type { FarmerFacts, LandSizeClass } from '@/lib/schemes/types';
import { getSuitableCrops, type SoilSnapshot } from '@/lib/crop-suitability';
import { getCropInfo } from '@/lib/crop-info';

type Locale = 'en' | 'hi' | 'ta';
interface L { en: string; hi: string; ta: string }

export type SoilFamily =
  | 'alluvial' | 'red-loam' | 'sandy-loam' | 'black-cotton'
  | 'clay' | 'coastal' | 'red-gravel' | 'other';

export type InsightType = 'crop' | 'scheme' | 'practice';

export interface PeerProfile {
  farmerId: string;
  district: string | null;
  address: string | null;
  landSizeClass: LandSizeClass | null;
  soilFamily: SoilFamily;
  /** Canonical crop keys the farmer grows/plans. */
  crops: string[];
  /** Ids of schemes this farmer is eligible/likely for (for peer social-proof). */
  eligibleSchemeIds: Set<string>;
  facts: FarmerFacts;
}

export interface Insight {
  type: InsightType;
  /** Stable dedupe key, e.g. `crop:Banana`, `scheme:<id>`, `practice:Paddy`. */
  key: string;
  crop?: string;
  /** How the referenced peer is "like you": same soil, or about the same size. */
  sharedKind?: 'soil' | 'size';
  soilFamily?: SoilFamily;
  /** Peer's district, only when it differs from the recipient's (cross-area framing). */
  peerDistrict?: string | null;
  schemeName?: string;
  benefit?: string;
  applyText?: string;
  url?: string;
}

// ---------------------------------------------------------------------------
// Normalisation
// ---------------------------------------------------------------------------

/** Map the free-text `typography` to a coarse soil family used for clustering. */
export function soilFamily(typography?: string | null): SoilFamily {
  const t = String(typography ?? '').toLowerCase();
  if (!t) return 'other';
  if (/black ?cotton|karisal|regur|black soil/.test(t)) return 'black-cotton';
  if (/coastal/.test(t)) return 'coastal';
  if (/sand/.test(t)) return 'sandy-loam';
  if (/alluv|delta|cauvery|basin/.test(t)) return 'alluvial';
  if (/gravel/.test(t)) return 'red-gravel';
  if (/(red|ferrugin).*loam|loam.*red/.test(t)) return 'red-loam';
  if (/clay/.test(t)) return 'clay';
  if (/loam/.test(t)) return 'red-loam';
  return 'other';
}

function normDistrict(d?: string | null): string {
  return String(d ?? '').toLowerCase().replace(/[^a-z]/g, '');
}

// ---------------------------------------------------------------------------
// Pool + similarity
// ---------------------------------------------------------------------------

/**
 * Build the in-memory peer pool from raw farmer_profiles items and a map of each
 * farmer's (already normalised) crop keys. Pure: pass scanned data in.
 */
export function buildPeerPool(
  farmers: Array<Record<string, unknown>>,
  cropsByFarmer: Map<string, string[]>,
): PeerProfile[] {
  const pool: PeerProfile[] = [];
  for (const f of farmers) {
    const farmerId = String(f.farmer_id ?? '');
    if (!farmerId) continue;
    const crops = cropsByFarmer.get(farmerId) ?? [];
    const facts = buildFarmerFacts(f, crops.map((c) => ({ crop_name: c })));
    const eligibleSchemeIds = new Set(
      matchSchemes(facts).filter((m) => m.status !== 'check').map((m) => m.scheme.id),
    );
    pool.push({
      farmerId,
      district: typeof f.district === 'string' && f.district ? f.district : null,
      address: typeof f.address === 'string' && f.address ? f.address : null,
      landSizeClass: landSizeClass(facts.landAreaAcres),
      soilFamily: soilFamily(typeof f.typography === 'string' ? f.typography : ''),
      crops,
      eligibleSchemeIds,
      facts,
    });
  }
  return pool;
}

const sameClass = (a: PeerProfile, b: PeerProfile) =>
  a.landSizeClass != null && a.landSizeClass === b.landSizeClass;
const sameSoil = (a: PeerProfile, b: PeerProfile) =>
  a.soilFamily !== 'other' && a.soilFamily === b.soilFamily;
const differentDistrict = (a: PeerProfile, b: PeerProfile) =>
  !!a.district && !!b.district && normDistrict(a.district) !== normDistrict(b.district);

// ---------------------------------------------------------------------------
// Insight selection
// ---------------------------------------------------------------------------

const DEFAULT_ORDER: InsightType[] = ['crop', 'scheme', 'practice'];

function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

/**
 * Per-farmer, per-week priority order so a single weekly push delivers a mix of
 * crop / scheme / practice insights (not the same type for everyone), and the
 * same farmer sees a different lead type week to week.
 */
export function rotationOrder(farmerId: string, weekSeed = 0): InsightType[] {
  const k = ((hashStr(farmerId) + weekSeed) % 3 + 3) % 3;
  return [...DEFAULT_ORDER.slice(k), ...DEFAULT_ORDER.slice(0, k)];
}

/**
 * Pick the best unseen insight for a recipient, or null if nothing useful.
 * `soil` is the recipient's latest soil snapshot (may be null). `order` sets which
 * insight type is tried first (see `rotationOrder`).
 */
export function selectInsight(
  recipient: PeerProfile,
  pool: PeerProfile[],
  sentKeys: Set<string>,
  soil: SoilSnapshot | null,
  order: InsightType[] = DEFAULT_ORDER,
): Insight | null {
  for (const type of order) {
    const ins =
      type === 'crop' ? cropInsight(recipient, pool, sentKeys, soil)
      : type === 'scheme' ? schemeInsight(recipient, pool, sentKeys)
      : practiceInsight(recipient, sentKeys);
    if (ins) return ins;
  }
  return null;
}

function cropInsight(
  recipient: PeerProfile,
  pool: PeerProfile[],
  sentKeys: Set<string>,
  soil: SoilSnapshot | null,
): Insight | null {
  // Crops that actually suit the recipient's land (district + soil scored).
  const suitable = getSuitableCrops(recipient.address ?? recipient.district, soil)
    .filter((c) => c.soilFit !== 'poor');
  if (!suitable.length) return null;
  const suitScore = new Map(suitable.map((c) => [c.cropName, c.score]));
  const own = new Set(recipient.crops);

  // Cross-area peers: similar by soil OR size (not geography).
  const peers = pool.filter(
    (p) => p.farmerId !== recipient.farmerId && (sameSoil(recipient, p) || sameClass(recipient, p)),
  );

  let best: { crop: string; score: number; peer: PeerProfile; shared: 'soil' | 'size' } | null = null;
  for (const p of peers) {
    const shared: 'soil' | 'size' = sameSoil(recipient, p) ? 'soil' : 'size';
    for (const crop of p.crops) {
      if (own.has(crop)) continue;
      const score = suitScore.get(crop);
      if (score == null) continue;
      if (sentKeys.has(`crop:${crop}`)) continue;
      const better =
        !best ||
        score > best.score ||
        // tie-break: prefer a soil match, then a peer in a different district
        (score === best.score && shared === 'soil' && best.shared !== 'soil') ||
        (score === best.score && differentDistrict(recipient, p) && !differentDistrict(recipient, best.peer));
      if (better) best = { crop, score, peer: p, shared };
    }
  }
  if (!best) return null;

  return {
    type: 'crop',
    key: `crop:${best.crop}`,
    crop: best.crop,
    sharedKind: best.shared,
    soilFamily: recipient.soilFamily,
    peerDistrict: differentDistrict(recipient, best.peer) ? best.peer.district : null,
  };
}

function schemeInsight(
  recipient: PeerProfile,
  pool: PeerProfile[],
  sentKeys: Set<string>,
): Insight | null {
  const matches = matchSchemes(recipient.facts).filter((m) => m.status !== 'check');
  if (!matches.length) return null;

  // Prefer schemes that a similar peer is also eligible for (real social proof),
  // keeping the matcher's score order within each group (Array.sort is stable).
  const peers = pool.filter(
    (p) => p.farmerId !== recipient.farmerId && (sameClass(recipient, p) || sameSoil(recipient, p)),
  );
  const sharedByPeer = (id: string) => peers.some((p) => p.eligibleSchemeIds.has(id));
  const ordered = [...matches].sort(
    (a, b) => Number(sharedByPeer(b.scheme.id)) - Number(sharedByPeer(a.scheme.id)),
  );

  // Spread choices across the top tier by a stable per-farmer offset, so different
  // farmers surface different schemes in one push (not all the same top scheme).
  const candidates = ordered.filter((m) => !sentKeys.has(`scheme:${m.scheme.id}`));
  if (!candidates.length) return null;
  const top = candidates.slice(0, 6);
  const m = top[hashStr(recipient.farmerId) % top.length];

  const apply = m.scheme.process?.find((p) => p.md)?.md;
  return {
    type: 'scheme',
    key: `scheme:${m.scheme.id}`,
    schemeName: m.scheme.name || m.scheme.shortTitle || '',
    benefit: snippet(m.scheme.benefits, 150),
    applyText: apply ? snippet(apply, 110) : undefined,
    url: m.scheme.references?.find((r) => r.url)?.url ?? '',
  };
}

function practiceInsight(recipient: PeerProfile, sentKeys: Set<string>): Insight | null {
  for (const crop of recipient.crops) {
    const info = getCropInfo(crop);
    if (!info) continue;
    const key = `practice:${info.key}`;
    if (sentKeys.has(key)) continue;
    return { type: 'practice', key, crop: info.key };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Composition (localised, anonymised)
// ---------------------------------------------------------------------------

const SOIL_LABEL: Record<SoilFamily, L> = {
  alluvial: { en: 'alluvial', ta: 'வண்டல்', hi: 'जलोढ़' },
  'red-loam': { en: 'red-loam', ta: 'செம்மண் வண்டல்', hi: 'लाल दोमट' },
  'sandy-loam': { en: 'sandy-loam', ta: 'மணல் வண்டல்', hi: 'बलुई दोमट' },
  'black-cotton': { en: 'black-cotton', ta: 'கரிசல்', hi: 'काली कपास' },
  clay: { en: 'clay', ta: 'களிமண்', hi: 'चिकनी' },
  coastal: { en: 'coastal sandy', ta: 'கடலோர மணல்', hi: 'तटीय बलुई' },
  'red-gravel': { en: 'red-gravel', ta: 'செம்மண் சரளை', hi: 'लाल बजरी' },
  other: { en: 'similar', ta: 'ஒத்த', hi: 'मिलती-जुलती' },
};

const OPT_OUT: L = {
  en: '_Reply STOP to stop these tips._',
  ta: '_இந்த குறிப்புகளை நிறுத்த STOP என அனுப்பவும்._',
  hi: '_ये सुझाव बंद करने के लिए STOP भेजें।_',
};

/** "A farmer like you …" — anonymised peer descriptor with optional cross-area note. */
function peerDescriptor(locale: Locale, ins: Insight): string {
  const district = ins.peerDistrict ?? '';
  const soil = SOIL_LABEL[ins.soilFamily ?? 'other'][locale];
  if (locale === 'ta') {
    const base = ins.sharedKind === 'soil'
      ? `உங்களைப் போலவே ${soil} மண் உள்ள ஒரு விவசாயி`
      : `உங்கள் அளவிலான நிலம் கொண்ட ஒரு விவசாயி`;
    return base + (district ? ` (${district})` : '');
  }
  if (locale === 'hi') {
    const base = ins.sharedKind === 'soil'
      ? `आप जैसी ${soil} मिट्टी वाले एक किसान`
      : `आप जितनी ज़मीन वाले एक किसान`;
    return base + (district ? ` (${district})` : '');
  }
  const base = ins.sharedKind === 'soil'
    ? `A farmer with the same ${soil} soil as you`
    : `A farmer with a holding about your size`;
  return base + (district ? `, over in ${district},` : '');
}

/** Build the WhatsApp message body for an insight in the recipient's language. */
export function composeInsight(locale: Locale, ins: Insight): string {
  const tail = `\n\n${OPT_OUT[locale]}`;

  if (ins.type === 'crop') {
    const crop = ins.crop ?? '';
    const who = peerDescriptor(locale, ins);
    if (locale === 'ta') {
      return `🌱 உங்களைப் போன்ற ஒரு விவசாயியின் யோசனை\n\n${who} இந்த பருவத்தில் *${crop}* பயிரிடுகிறார் — இது உங்கள் நிலத்திற்கும் ஏற்றது.\n\nஉங்கள் வயலுக்கு ஏற்ற ${crop} திட்டம் வேண்டுமா? பதில் அனுப்புங்கள். 🌾${tail}`;
    }
    if (locale === 'hi') {
      return `🌱 आप जैसे एक किसान का सुझाव\n\n${who} इस मौसम में *${crop}* उगा रहे हैं — और यह आपकी ज़मीन के लिए भी सही है।\n\nअपने खेत के लिए तैयार ${crop} योजना चाहिए? बस जवाब दें। 🌾${tail}`;
    }
    return `🌱 An idea from a farmer like you\n\n${who} is growing *${crop}* this season — and it suits your land too.\n\nWant a ready ${crop} plan for your field? Just reply and ask. 🌾${tail}`;
  }

  if (ins.type === 'scheme') {
    const name = ins.schemeName ?? '';
    const benefit = ins.benefit ?? '';
    const link = ins.url ? `🔗 ${ins.url}\n` : '';
    if (locale === 'ta') {
      const apply = ins.applyText ? ` விண்ணப்பிக்க: ${ins.applyText}` : '';
      return `🏛️ நீங்கள் தவறவிட்டிருக்கக்கூடிய ஒரு திட்டம்\n\nஉங்களைப் போன்ற நிலம் உள்ள விவசாயிகள் *${name}* பெறலாம்.\n✅ ${benefit}\n\nநீங்கள் தகுதி பெற வாய்ப்புள்ளது.${apply}\n${link}_விண்ணப்பிக்கும் முன் அதிகாரப்பூர்வ பக்கத்தில் சரிபார்க்கவும்._${tail}`;
    }
    if (locale === 'hi') {
      const apply = ins.applyText ? ` आवेदन: ${ins.applyText}` : '';
      return `🏛️ एक योजना जो आप शायद चूक रहे हैं\n\nआप जैसी ज़मीन वाले किसान *${name}* पा सकते हैं।\n✅ ${benefit}\n\nआप शायद पात्र हैं।${apply}\n${link}_आवेदन से पहले आधिकारिक पेज पर जाँच करें।_${tail}`;
    }
    const apply = ins.applyText ? ` To apply: ${ins.applyText}` : '';
    return `🏛️ A scheme you may be missing\n\nFarmers with land like yours can get *${name}*.\n✅ ${benefit}\n\nYou likely qualify.${apply}\n${link}_Please verify on the official page before applying._${tail}`;
  }

  // practice
  const crop = ins.crop ?? '';
  const tip = getCropInfo(crop)?.tip[locale] ?? '';
  if (locale === 'ta') {
    return `🌾 உங்களைப் போல ${crop} பயிரிடும் விவசாயிகளின் குறிப்பு\n\n${tip}\n\nஉங்கள் ${crop} பயிர் குறித்து கேள்வி உள்ளதா? பதில் அனுப்புங்கள். 🌱${tail}`;
  }
  if (locale === 'hi') {
    return `🌾 आप जैसे ${crop} उगाने वाले किसानों की एक सलाह\n\n${tip}\n\nअपनी ${crop} फसल के बारे में सवाल है? बस जवाब दें। 🌱${tail}`;
  }
  return `🌾 A tip from farmers growing ${crop} like you\n\n${tip}\n\nGot a question about your ${crop}? Just reply. 🌱${tail}`;
}
