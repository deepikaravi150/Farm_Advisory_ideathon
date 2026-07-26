/**
 * Create the two DynamoDB tables that back the pest-outbreak geo-alerts, then
 * smoke-test their key schema (put/get/query/delete). Idempotent — safe to re-run.
 *
 *   pest_reports : PK report_id (S)
 *   pest_alerts  : PK farmer_id (S), SK pest_key (S)
 *
 * Run:  npx tsx scripts/setup-pest-tables.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnvLocal() {
  let raw: string;
  try {
    raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
  } catch {
    console.error('Could not read .env.local — run from the project root.');
    return;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let value = t.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

loadEnvLocal();

async function main() {
  const {
    DynamoDBClient,
    CreateTableCommand,
    DescribeTableCommand,
    waitUntilTableExists,
  } = await import('@aws-sdk/client-dynamodb');

  const region = process.env.AWS_REGION ?? 'ap-south-1';
  const client = new DynamoDBClient({ region });

  async function ensureTable(
    name: string,
    keySchema: { AttributeName: string; KeyType: 'HASH' | 'RANGE' }[],
    attrs: { AttributeName: string; AttributeType: 'S' }[],
  ) {
    try {
      await client.send(new DescribeTableCommand({ TableName: name }));
      console.log(`✓ ${name} already exists`);
      return;
    } catch (e) {
      if ((e as { name?: string }).name !== 'ResourceNotFoundException') throw e;
    }
    console.log(`… creating ${name}`);
    await client.send(new CreateTableCommand({
      TableName: name,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: keySchema,
      AttributeDefinitions: attrs,
    }));
    await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: name });
    console.log(`✓ ${name} created and ACTIVE`);
  }

  await ensureTable(
    'pest_reports',
    [{ AttributeName: 'report_id', KeyType: 'HASH' }],
    [{ AttributeName: 'report_id', AttributeType: 'S' }],
  );
  await ensureTable(
    'pest_alerts',
    [{ AttributeName: 'farmer_id', KeyType: 'HASH' }, { AttributeName: 'pest_key', KeyType: 'RANGE' }],
    [{ AttributeName: 'farmer_id', AttributeType: 'S' }, { AttributeName: 'pest_key', AttributeType: 'S' }],
  );

  // Smoke-test the schema via the app's own helpers.
  const { putItem, getItem, queryItems, deleteItem, Tables } = await import('../lib/aws/dynamodb');
  const FID = '__SMOKETEST__';
  const PK = 'smoke-pest';

  await putItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R', farmer_id: FID, pest_key: PK, status: 'active' });
  await putItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK, status: 'pending', alerted_at: new Date().toISOString() });

  const report = await getItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R' });
  const alert = await getItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK });
  const byFarmer = await queryItems({
    TableName: Tables.PEST_ALERTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': FID },
  });

  console.log(`\nSmoke test:`);
  console.log(`  pest_reports getItem: ${report ? 'OK' : 'FAIL'}`);
  console.log(`  pest_alerts getItem : ${alert ? 'OK' : 'FAIL'}`);
  console.log(`  pest_alerts query   : ${byFarmer.length === 1 ? 'OK' : 'FAIL'} (${byFarmer.length})`);

  await deleteItem(Tables.PEST_REPORTS, { report_id: 'SMOKE-R' });
  await deleteItem(Tables.PEST_ALERTS, { farmer_id: FID, pest_key: PK });
  console.log('  cleanup             : OK');
  console.log('\nDone. Pest tables are ready.');
}

main().catch((e) => {
  console.error('setup failed:', e);
  process.exit(1);
});
