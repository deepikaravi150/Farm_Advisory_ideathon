/**
 * Offline dry-run of the peer-insight engine against the real farmer_profiles /
 * crop_plans / soil_reports data — no WhatsApp sends. Prints each farmer's
 * cluster signature and the insight they would receive.
 *
 * Run:  npx tsx scripts/test-peer-insights.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { scanItems, Tables } from '../lib/aws/dynamodb';
import { getCropInfo } from '../lib/crop-info';
import type { SoilSnapshot } from '../lib/crop-suitability';
import { buildPeerPool, selectInsight, composeInsight, rotationOrder } from '../lib/insights/peer-insights';

function loadEnvLocal() {
  for (const f of ['.env.local', '.env']) {
    if (!existsSync(f)) continue;
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnvLocal();

type Locale = 'en' | 'hi' | 'ta';
const pickLocale = (v: unknown): Locale => (v === 'hi' || v === 'ta' ? v : 'en');

function toSoil(doc: Record<string, unknown> | null): SoilSnapshot | null {
  if (!doc) return null;
  return {
    ph: (doc.ph as number | string | null) ?? null,
    nitrogen: (doc.nitrogen as string | null) ?? null,
    phosphorus: (doc.phosphorus as string | null) ?? null,
    potassium: (doc.potassium as string | null) ?? null,
    organicCarbon: (doc.organic_carbon as string | null) ?? null,
  };
}

async function main() {
  const [farmers, plans, soils] = await Promise.all([
    scanItems(Tables.FARMER_PROFILES),
    scanItems(Tables.CROP_PLANS),
    scanItems(Tables.SOIL_REPORTS),
  ]);

  const cropsByFarmer = new Map<string, string[]>();
  for (const p of plans) {
    const fid = String(p.farmer_id ?? '');
    const raw = typeof p.crop_name === 'string' ? p.crop_name : '';
    if (!fid || !raw) continue;
    const key = getCropInfo(raw)?.key ?? raw.trim();
    const arr = cropsByFarmer.get(fid) ?? [];
    if (!arr.includes(key)) arr.push(key);
    cropsByFarmer.set(fid, arr);
  }

  const soilByFarmer = new Map<string, Record<string, unknown>>();
  for (const s of soils) {
    const fid = String(s.farmer_id ?? '');
    if (!fid) continue;
    const cur = soilByFarmer.get(fid);
    if (!cur || s.is_current || String(s.uploaded_at ?? '') > String(cur.uploaded_at ?? '')) soilByFarmer.set(fid, s);
  }

  const pool = buildPeerPool(farmers, cropsByFarmer);
  const byId = new Map(pool.map((p) => [p.farmerId, p]));
  const weekSeed = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

  const counts: Record<string, number> = { crop: 0, scheme: 0, practice: 0, none: 0 };

  for (const f of farmers) {
    const fid = String(f.farmer_id ?? '');
    const rec = byId.get(fid);
    if (!rec) continue;
    const insight = selectInsight(rec, pool, new Set(), toSoil(soilByFarmer.get(fid) ?? null), rotationOrder(fid, weekSeed));
    const locale = pickLocale(f.preferred_language);

    console.log('─'.repeat(72));
    console.log(`${String(f.name ?? '?')}  [${fid}]  ${rec.district ?? '-'}  ${locale}`);
    console.log(`  size=${rec.landSizeClass ?? '-'}  soil=${rec.soilFamily}  crops=[${rec.crops.join(', ') || '—'}]`);
    if (!insight) { counts.none++; console.log('  → (no insight)'); continue; }
    counts[insight.type]++;
    console.log(`  → ${insight.type.toUpperCase()}  key=${insight.key}`);
    console.log(composeInsight(locale, insight).split('\n').map((l) => '    ' + l).join('\n'));
  }

  console.log('─'.repeat(72));
  console.log(`Farmers: ${pool.length} | crop=${counts.crop} scheme=${counts.scheme} practice=${counts.practice} none=${counts.none}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
