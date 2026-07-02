/**
 * Create the DynamoDB table for the farmer financial ledger, then smoke-test its
 * key schema (put/get/query/delete). Idempotent — safe to re-run.
 *
 *   financial_entries : PK farmer_id (S), SK entry_id (S)
 *
 * Run:  npx tsx scripts/setup-financial-table.ts
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
    'financial_entries',
    [{ AttributeName: 'farmer_id', KeyType: 'HASH' }, { AttributeName: 'entry_id', KeyType: 'RANGE' }],
    [{ AttributeName: 'farmer_id', AttributeType: 'S' }, { AttributeName: 'entry_id', AttributeType: 'S' }],
  );

  // Smoke-test the schema via the app's own helpers.
  const { putItem, getItem, queryItems, deleteItem, Tables } = await import('../lib/aws/dynamodb');
  const FID = '__SMOKETEST__';
  const KEY = `${new Date().toISOString()}#smoke`;

  await putItem(Tables.FINANCIAL_ENTRIES, {
    farmer_id: FID, entry_id: KEY, type: 'expense', amount: 1, category: 'other', occurred_at: '2026-01-01', created_at: new Date().toISOString(),
  });

  const row = await getItem(Tables.FINANCIAL_ENTRIES, { farmer_id: FID, entry_id: KEY });
  const byFarmer = await queryItems({
    TableName: Tables.FINANCIAL_ENTRIES,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': FID },
  });

  console.log(`\nSmoke test:`);
  console.log(`  financial_entries getItem: ${row ? 'OK' : 'FAIL'}`);
  console.log(`  financial_entries query  : ${byFarmer.length === 1 ? 'OK' : 'FAIL'} (${byFarmer.length})`);

  await deleteItem(Tables.FINANCIAL_ENTRIES, { farmer_id: FID, entry_id: KEY });
  console.log('  cleanup                  : OK');
  console.log('\nDone. financial_entries table is ready.');
}

main().catch((e) => {
  console.error('setup failed:', e);
  process.exit(1);
});
