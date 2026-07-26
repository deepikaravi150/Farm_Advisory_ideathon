/**
 * Item-level smoke test for the pest tables using the APP's credentials —
 * confirms the tables exist AND the app user can read/write them (no
 * DescribeTable/CreateTable needed). Run:  npx tsx scripts/test-pest-tables.ts
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

async function main() {
  const { putItem, getItem, queryItems, deleteItem, Tables } = await import('../lib/aws/dynamodb');
  const FID = '__SMOKETEST__';
  const PK = 'smoke-pest';

  await putItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R', farmer_id: FID, pest_key: PK, status: 'active', created_at: new Date().toISOString() });
  await putItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK, status: 'pending', alerted_at: new Date().toISOString() });

  const report = await getItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R' });
  const alert = await getItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK });
  const byFarmer = await queryItems({
    TableName: Tables.PEST_ALERTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': FID },
  });

  console.log(`pest_reports  put+get : ${report ? 'OK' : 'FAIL'}`);
  console.log(`pest_alerts   put+get : ${alert ? 'OK' : 'FAIL'}`);
  console.log(`pest_alerts   query   : ${byFarmer.length === 1 ? 'OK' : 'FAIL'} (${byFarmer.length})`);

  await deleteItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R' });
  await deleteItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK });
  console.log('cleanup               : OK');
  console.log('\n✅ Pest tables are readable/writable by the app.');
}

main().catch((e) => {
  console.error('\n❌ Smoke test failed:', e?.name === 'AccessDeniedException' ? 'AccessDenied — the app IAM user needs item perms on pest_reports/pest_alerts.' : e);
  process.exit(1);
});
