/**
 * Fill in sample details on existing farmer_profiles records so the app (esp.
 * government-scheme matching) demos well. Each record is assigned a varied,
 * realistic TN persona (district, soil, community, age, income, category) and a
 * gender inferred from the name. Only BLANK fields are filled — existing values
 * (name, phone, coordinates, language, land area) are never overwritten.
 *
 * Dry run (default):  npx tsx scripts/seed-sample-profile-fields.ts
 * Apply writes:       npx tsx scripts/seed-sample-profile-fields.ts --apply
 * Env: AWS creds + AWS_REGION (read from .env.local automatically).
 */
import { readFileSync, existsSync } from 'node:fs';
import { scanItems, updateItem, Tables } from '../lib/aws/dynamodb';

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

const APPLY = process.argv.includes('--apply');

interface Persona {
  district: string;
  village: string;
  land: number;
  typography: string;
  survey: string;
  community: string;
  age: number;
  income: number;
  category: string;
}

const PERSONAS: Persona[] = [
  { district: 'Thanjavur', village: 'Pillaiyarpatti', land: 2.5, typography: 'Cauvery delta alluvial clay, flat and well-irrigated', survey: '142/3B', community: 'SC', age: 38, income: 90000, category: 'Small / Marginal farmer' },
  { district: 'Coimbatore', village: 'Pollachi', land: 3.2, typography: 'Red loam, gently undulating, drip-irrigated', survey: '57/4C', community: 'BC', age: 45, income: 180000, category: 'Semi-medium farmer' },
  { district: 'Madurai', village: 'Thirumangalam', land: 4.0, typography: 'Black cotton soil, level, rain-fed with one bore well', survey: '205/2', community: 'MBC', age: 50, income: 150000, category: 'Semi-medium farmer' },
  { district: 'Erode', village: 'Chennimalai', land: 1.8, typography: 'Red sandy loam, gently sloping, bore-well irrigated', survey: '88/1A', community: 'General', age: 41, income: 110000, category: 'Small / Marginal farmer' },
  { district: 'Salem', village: 'Attur', land: 1.2, typography: 'Red loam mixed with gravel, sloping, rain-fed', survey: '19/2A', community: 'ST', age: 34, income: 70000, category: 'Small / Marginal farmer' },
  { district: 'Tiruchirappalli', village: 'Lalgudi', land: 2.0, typography: 'Cauvery basin alluvial loam, flat, canal-irrigated', survey: '110/1', community: 'Minority', age: 47, income: 95000, category: 'Small / Marginal farmer' },
  { district: 'Villupuram', village: 'Tindivanam', land: 5.5, typography: 'Red ferruginous loam, level, tank and bore-well irrigated', survey: '301/6', community: 'General', age: 55, income: 240000, category: 'Medium farmer' },
  { district: 'Cuddalore', village: 'Chidambaram', land: 1.5, typography: 'Coastal alluvial sandy clay, flat, canal-irrigated', survey: '76/3', community: 'SC', age: 60, income: 65000, category: 'Small / Marginal farmer' },
];

const FEMALE_TOKENS = [
  'sowmya', 'deepika', 'aarthi', 'malar', 'lakshmi', 'selvi', 'fathima', 'saraswathi',
  'revathi', 'priya', 'divya', 'meena', 'geetha', 'kavya', 'devi', 'nandhini', 'abinaya', 'vani', 'uma',
];

function inferGender(name: unknown): 'male' | 'female' {
  const n = String(name ?? '').toLowerCase();
  return FEMALE_TOKENS.some((f) => n.includes(f)) ? 'female' : 'male';
}

function hash(s: string): number {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

const isBlank = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);

async function main() {
  const items = await scanItems(Tables.FARMER_PROFILES);
  console.log(`Found ${items.length} farmer_profiles record(s).\n`);

  let changed = 0;
  for (const item of items) {
    const id = String(item.farmer_id);
    const p = PERSONAS[hash(id) % PERSONAS.length];

    const updates: Record<string, unknown> = {};
    const set = (k: string, v: unknown) => { if (isBlank(item[k])) updates[k] = v; };

    set('district', p.district);
    set('address', `${p.village}, ${p.district}, Tamil Nadu`);
    set('typography', p.typography);
    set('survey_number', p.survey);
    set('land_area_acres', p.land);
    set('gender', inferGender(item.name));
    set('community', p.community);
    set('age', p.age);
    set('annual_income', p.income);
    set('category', p.category);

    if (!Object.keys(updates).length) {
      console.log(`• ${id.padEnd(15)} ${String(item.name ?? '?').padEnd(16)} — complete, nothing to set`);
      continue;
    }

    console.log(`• ${id.padEnd(15)} ${String(item.name ?? '?').padEnd(16)} ${p.district}, ${updates.gender ?? item.gender}`);
    console.log(`    -> ${JSON.stringify(updates)}`);

    if (APPLY) {
      const names: Record<string, string> = {};
      const values: Record<string, unknown> = {};
      const sets: string[] = [];
      let i = 0;
      for (const [k, v] of Object.entries(updates)) {
        names[`#k${i}`] = k;
        values[`:v${i}`] = v;
        sets.push(`#k${i} = :v${i}`);
        i++;
      }
      await updateItem({
        TableName: Tables.FARMER_PROFILES,
        Key: { farmer_id: id },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      });
    }
    changed++;
  }

  console.log(`\n${APPLY ? '✓ Applied to' : '(dry run) would update'} ${changed} record(s).`);
  if (!APPLY && changed) console.log('Re-run with --apply to write these changes.');
}

main().catch((e) => { console.error(e); process.exit(1); });
