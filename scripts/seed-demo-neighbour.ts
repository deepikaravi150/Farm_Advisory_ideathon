/**
 * Seed a demo farmer whose land sits ~2 km from Eesa's field (within the 3 km
 * pest-alert radius), with NO phone attached yet. Prints the new farmer_id and
 * the distance. Run:  npx tsx scripts/seed-demo-neighbour.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  let raw = '';
  try { raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8'); }
  catch { console.error('Could not read .env.local'); return; }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!(key in process.env)) process.env[key] = v;
  }
}
loadEnvLocal();

const NEW_FARMER_ID = 'TN90000000001';
const NEW_NAME = 'Demo Neighbour';
const EESA = 'TN12346789012';

async function main() {
  const { getItem, putItem, Tables } = await import('../lib/aws/dynamodb');
  const { extractCentroid, haversineKm, generateId } = await import('../lib/utils');

  const eesa = await getItem(Tables.FARMER_PROFILES, { farmer_id: EESA });
  if (!eesa) throw new Error('Eesa profile not found');
  const coords = eesa.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
  if (!coords?.length) throw new Error('Eesa has no land_coordinates');

  // Shift the whole parcel ~2 km north of Eesa's field.
  const LAT_OFFSET = 0.018; // ~2 km
  const newCoords = coords.map((c) => ({ lat: c.lat + LAT_OFFSET, lng: c.lng }));

  const distance = haversineKm(extractCentroid(coords), extractCentroid(newCoords));

  const existing = await getItem(Tables.FARMER_PROFILES, { farmer_id: NEW_FARMER_ID });
  if (existing) {
    console.log(`Note: ${NEW_FARMER_ID} already exists — overwriting its land/profile.`);
  }

  const profile = {
    farmer_id: NEW_FARMER_ID,
    unique_id: generateId(),
    // phone intentionally omitted (not attached yet) — empty string is invalid
    // for the phone-index GSI key, so we leave the attribute off entirely.
    name: NEW_NAME,
    address: eesa.address ?? '',
    district: eesa.district ?? '',
    land_coordinates: newCoords,
    typography: eesa.typography ?? 'general land',
    land_area_acres: eesa.land_area_acres ?? 2,
    land_picture_s3_key: '',
    phone_verified: false,
    preferred_language: 'en',
    source: 'demo_seed_pest_neighbour',
    created_at: new Date().toISOString(),
  };

  await putItem(Tables.FARMER_PROFILES, profile);

  console.log('\n✅ Demo neighbour created:');
  console.log(`   farmer_id : ${NEW_FARMER_ID}`);
  console.log(`   name      : ${NEW_NAME}`);
  console.log(`   phone     : (none — attach later)`);
  console.log(`   district  : ${profile.district}`);
  console.log(`   distance from Eesa's field: ${distance.toFixed(2)} km (radius is 3 km)`);
}

main().catch((e) => { console.error('seed failed:', e); process.exit(1); });
