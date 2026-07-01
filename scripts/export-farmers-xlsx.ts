/**
 * Export the farmer_profiles DynamoDB table to a local Excel file so the users
 * can be reviewed in a spreadsheet.
 *
 * Run:  npx tsx scripts/export-farmers-xlsx.ts [outPath]
 * Out:  farmer-profiles.xlsx (repo root by default)
 * Env:  AWS creds + AWS_REGION (read from .env.local automatically).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as XLSX from 'xlsx';
import { scanItems, Tables } from '../lib/aws/dynamodb';

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

const OUT = process.argv[2] || 'farmer-profiles.xlsx';

function centroid(coords: unknown): { lat: string; lng: string } {
  if (!Array.isArray(coords) || !coords.length) return { lat: '', lng: '' };
  let lat = 0, lng = 0, n = 0;
  for (const c of coords) {
    if (c && typeof c.lat === 'number' && typeof c.lng === 'number') { lat += c.lat; lng += c.lng; n++; }
  }
  return n ? { lat: (lat / n).toFixed(5), lng: (lng / n).toFixed(5) } : { lat: '', lng: '' };
}

async function main() {
  const items = await scanItems(Tables.FARMER_PROFILES);

  const rows = items
    .map((it) => {
      const c = centroid(it.land_coordinates);
      return {
        'Farmer ID': it.farmer_id ?? '',
        Name: it.name ?? '',
        Phone: it.phone ?? '',
        Gender: it.gender ?? '',
        Age: it.age ?? '',
        Community: it.community ?? '',
        Category: it.category ?? '',
        District: it.district ?? '',
        Address: it.address ?? '',
        'Land (acres)': it.land_area_acres ?? '',
        'Land type': it.typography ?? '',
        'Survey no.': it.survey_number ?? '',
        'Annual income (₹)': it.annual_income ?? '',
        Language: it.preferred_language ?? '',
        'Land points': Array.isArray(it.land_coordinates) ? it.land_coordinates.length : 0,
        'Centroid lat': c.lat,
        'Centroid lng': c.lng,
        Source: it.source ?? '',
        'Phone verified': it.phone_verified ? 'yes' : 'no',
        'Memory facts': Array.isArray(it.memory) ? it.memory.length : 0,
        Created: it.created_at ?? '',
      };
    })
    .sort((a, b) => String(a.District).localeCompare(String(b.District)) || String(a.Name).localeCompare(String(b.Name)));

  const ws = XLSX.utils.json_to_sheet(rows);

  // Reasonable column widths for readability.
  const widths: Record<string, number> = {
    'Farmer ID': 15, Name: 16, Phone: 12, Gender: 8, Age: 5, Community: 11, Category: 22,
    District: 16, Address: 32, 'Land (acres)': 11, 'Land type': 42, 'Survey no.': 11,
    'Annual income (₹)': 16, Language: 9, 'Land points': 11, 'Centroid lat': 12, 'Centroid lng': 12,
    Source: 22, 'Phone verified': 13, 'Memory facts': 12, Created: 26,
  };
  ws['!cols'] = Object.keys(rows[0] ?? {}).map((k) => ({ wch: widths[k] ?? 14 }));
  ws['!autofilter'] = { ref: ws['!ref'] as string };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Farmers');
  XLSX.writeFile(wb, OUT);

  console.log(`✓ Wrote ${rows.length} farmers to ${resolve(OUT)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
