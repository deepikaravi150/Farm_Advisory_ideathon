import { NextRequest, NextResponse } from 'next/server';
import { scanItems, Tables } from '@/lib/aws/dynamodb';
import { sendWhatsApp } from '@/lib/whatsapp/twilio';
import { toIndiaPhone } from '@/lib/phone';
import { getCropInfo } from '@/lib/crop-info';
import type { SoilSnapshot } from '@/lib/crop-suitability';
import { buildPeerPool, selectInsight, composeInsight, rotationOrder } from '@/lib/insights/peer-insights';
import { getSentInsightKeys, recordInsightSent } from '@/lib/insights/store';

// LLM-free but does a few DynamoDB scans + sequential WhatsApp sends.
export const maxDuration = 60;

type Locale = 'en' | 'hi' | 'ta';
function pickLocale(value: unknown): Locale {
  const v = String(value ?? '');
  return v === 'hi' || v === 'ta' ? v : 'en';
}

function toSoilSnapshot(doc: Record<string, unknown> | null): SoilSnapshot | null {
  if (!doc) return null;
  return {
    ph: (doc.ph as number | string | null) ?? null,
    nitrogen: (doc.nitrogen as string | null) ?? null,
    phosphorus: (doc.phosphorus as string | null) ?? null,
    potassium: (doc.potassium as string | null) ?? null,
    organicCarbon: (doc.organic_carbon as string | null) ?? null,
  };
}

/**
 * Weekly peer-insight push. Clusters farmers by similar land/crop and sends each
 * an anonymised "a farmer like you did X" WhatsApp tip (crop idea / eligible
 * scheme / practice), grounded in real suitability + eligibility.
 *
 *   ?dryRun=1        compose + return previews, don't send or record
 *   ?farmerId=<id>   only process one farmer (testing)
 *
 * Auth: x-cron-secret / ?secret= must equal CRON_SECRET||ADMIN_SECRET, or the
 * Vercel cron header. Triggered weekly on EC2 via crontab curl.
 */
export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-cron-secret') || req.nextUrl.searchParams.get('secret');
  const expected = process.env.CRON_SECRET || process.env.ADMIN_SECRET;
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  if (expected && secret !== expected && !isVercelCron) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const dryRun = req.nextUrl.searchParams.get('dryRun') === '1';
  const onlyFarmerId = req.nextUrl.searchParams.get('farmerId');

  const [farmers, plans, soils] = await Promise.all([
    scanItems(Tables.FARMER_PROFILES),
    scanItems(Tables.CROP_PLANS),
    scanItems(Tables.SOIL_REPORTS),
  ]);

  // Crops each farmer grows/plans, normalised to canonical keys.
  const cropsByFarmer = new Map<string, string[]>();
  for (const plan of plans) {
    const fid = String(plan.farmer_id ?? '');
    const raw = typeof plan.crop_name === 'string' ? plan.crop_name : '';
    if (!fid || !raw) continue;
    const key = getCropInfo(raw)?.key ?? raw.trim();
    const arr = cropsByFarmer.get(fid) ?? [];
    if (!arr.includes(key)) arr.push(key);
    cropsByFarmer.set(fid, arr);
  }

  // Latest (current) soil report per farmer.
  const soilByFarmer = new Map<string, Record<string, unknown>>();
  for (const s of soils) {
    const fid = String(s.farmer_id ?? '');
    if (!fid) continue;
    const cur = soilByFarmer.get(fid);
    if (!cur || s.is_current || String(s.uploaded_at ?? '') > String(cur.uploaded_at ?? '')) {
      soilByFarmer.set(fid, s);
    }
  }

  const pool = buildPeerPool(farmers, cropsByFarmer);
  const poolById = new Map(pool.map((p) => [p.farmerId, p]));
  // Increments once a week so the lead insight type rotates week to week.
  const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

  const recipients = farmers.filter((f) => {
    const fid = String(f.farmer_id ?? '');
    if (onlyFarmerId) return fid === onlyFarmerId;
    return f.phone && f.phone_verified !== false && f.peer_insights_opt_out !== true;
  });

  const results: Array<Record<string, unknown>> = [];
  let sent = 0;

  for (const f of recipients) {
    const farmerId = String(f.farmer_id ?? '');
    const recipient = poolById.get(farmerId);
    if (!recipient) {
      results.push({ farmerId, sent: false, reason: 'not_in_pool' });
      continue;
    }
    if (!f.phone) {
      results.push({ farmerId, sent: false, reason: 'no_phone' });
      continue;
    }

    try {
      const sentKeys = await getSentInsightKeys(farmerId);
      const soil = toSoilSnapshot(soilByFarmer.get(farmerId) ?? null);
      const insight = selectInsight(recipient, pool, sentKeys, soil, rotationOrder(farmerId, weekSeed));
      if (!insight) {
        results.push({ farmerId, sent: false, reason: 'no_insight' });
        continue;
      }

      const locale = pickLocale(f.preferred_language);
      const body = composeInsight(locale, insight);

      if (dryRun) {
        results.push({ farmerId, sent: false, dryRun: true, type: insight.type, key: insight.key, preview: body });
        continue;
      }

      await sendWhatsApp(toIndiaPhone(String(f.phone)), body);
      await recordInsightSent(farmerId, insight);
      sent += 1;
      results.push({ farmerId, sent: true, type: insight.type, key: insight.key });
    } catch (e) {
      results.push({ farmerId, sent: false, reason: e instanceof Error ? e.message : 'failed' });
    }
  }

  return NextResponse.json({
    success: true,
    dryRun,
    totalFarmers: farmers.length,
    attempted: recipients.length,
    sent,
    results,
  });
}
