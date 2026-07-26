/**
 * Re-key any farmer_profiles record whose farmer_id doesn't match the registration
 * format (`TN` + 11 digits) to a fresh random valid ID — and migrate every related
 * record (chat_history, crop_plans, soil_reports, pest_alerts, peer_insights, and
 * the farmer_id attribute on pest_reports) so nothing is orphaned.
 *
 * farmer_id is a partition key, so "renaming" means put-new + delete-old across all
 * tables, using each table's real key schema. Records without a phone are skipped
 * (they can't be onboarded anyway).
 *
 * RECOVERY holds old->new pairs whose profile was already migrated in a partial run
 * but whose related records were left behind; those are re-attached to the new id.
 *
 * Dry run (default):  npx tsx scripts/migrate-farmer-ids.ts
 * Apply writes:       npx tsx scripts/migrate-farmer-ids.ts --apply
 */
import { readFileSync, existsSync } from 'node:fs';
import { scanItems, queryItems, putItem, deleteItem, Tables } from '../lib/aws/dynamodb';

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
const VALID = /^TN\d{11}$/;

// Key schema per table where farmer_id is the partition key (SK names are hardcoded
// because the app's IAM user can't DescribeTable).
const KEY_SCHEMA: Record<string, string[]> = {
  [Tables.FARMER_PROFILES]: ['farmer_id'],
  [Tables.CHAT_HISTORY]: ['farmer_id', 'timestamp'],
  [Tables.CROP_PLANS]: ['farmer_id', 'plan_id'],
  [Tables.SOIL_REPORTS]: ['farmer_id', 'uploaded_at'],
  [Tables.PEST_ALERTS]: ['farmer_id', 'pest_key'],
  [Tables.PEER_INSIGHTS]: ['farmer_id', 'insight_key'],
};

// Orphans from a previous partial run: profile already moved, related records not.
// old -> new (the already-migrated profile id). Related records are re-attached.
// Normally empty; populate only to clean up after an interrupted apply.
const RECOVERY: Record<string, string> = {};

function newId(taken: Set<string>): string {
  let id = '';
  do {
    id = 'TN' + String(Math.floor(1e10 + Math.random() * 9e10)); // 11 digits, no leading zero
  } while (taken.has(id));
  taken.add(id);
  return id;
}

/** Move every record under `old` farmer_id to `neu`, across all keyed tables. */
async function reKey(old: string, neu: string): Promise<number> {
  let moved = 0;
  for (const [table, keys] of Object.entries(KEY_SCHEMA)) {
    const items = await queryItems({
      TableName: table,
      KeyConditionExpression: 'farmer_id = :f',
      ExpressionAttributeValues: { ':f': old },
    }).catch(() => []);
    for (const item of items) {
      const oldKey = Object.fromEntries(keys.map((k) => [k, item[k]]));
      await putItem(table, { ...item, farmer_id: neu });
      await deleteItem(table, oldKey);
      moved++;
    }
  }
  // pest_reports keeps farmer_id as an attribute (PK is report_id).
  const reports = (await scanItems(Tables.PEST_REPORTS).catch(() => [])).filter((r) => String(r.farmer_id) === old);
  for (const r of reports) { await putItem(Tables.PEST_REPORTS, { ...r, farmer_id: neu }); moved++; }
  return moved;
}

async function main() {
  const profiles = await scanItems(Tables.FARMER_PROFILES);
  const taken = new Set(profiles.map((p) => String(p.farmer_id ?? '')));

  const mapping: { old: string; neu: string; name: string; profile: boolean }[] = [];

  for (const p of profiles) {
    const old = String(p.farmer_id ?? '');
    if (VALID.test(old)) continue;
    if (!p.phone) { console.log(`• SKIP ${old.padEnd(16)} ${String(p.name ?? '?')} — no phone (cannot onboard)`); continue; }
    mapping.push({ old, neu: newId(taken), name: String(p.name ?? '?'), profile: true });
  }
  for (const [old, neu] of Object.entries(RECOVERY)) {
    mapping.push({ old, neu, name: '(orphaned records → existing profile)', profile: false });
  }

  console.log(`\n${profiles.length} profiles. Planned re-keys:`);
  for (const m of mapping) console.log(`  ${m.old.padEnd(16)} -> ${m.neu}   ${m.name}`);

  if (!APPLY) {
    console.log('\n(dry run) Re-run with --apply to perform the migration.');
    return;
  }

  console.log('\nApplying…');
  for (const m of mapping) {
    const moved = await reKey(m.old, m.neu);
    console.log(`  ✓ ${m.old.padEnd(16)} -> ${m.neu}   (${moved} record(s))`);
  }
  console.log(`\nDone. Processed ${mapping.length} mapping(s).`);
}

main().catch((e) => { console.error(e); process.exit(1); });
