import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  type PutCommandInput,
  type GetCommandInput,
  type QueryCommandInput,
  type UpdateCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });
export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const LOCAL_DB_PATH = path.join(process.cwd(), '.local-db', 'dynamodb.json');
let useLocalDb = process.env.LOCAL_DYNAMODB_FALLBACK === 'true';

export const Tables = {
  FARMER_PROFILES: 'farmer_profiles',
  CHAT_HISTORY: 'chat_history',
  CROP_PLANS: 'crop_plans',
  SOIL_REPORTS: 'soil_reports',
  GOVERNMENT_SCHEMES: 'government_schemes',
} as const;

type LocalItem = Record<string, unknown>;
type LocalDb = Record<string, LocalItem[]>;

function shouldUseLocalFallback(err: unknown) {
  if (!(err instanceof Error)) return false;
  return (
    err.name === 'CredentialsProviderError' ||
    err.message.includes('Could not load credentials') ||
    err.message.includes('Missing credentials')
  );
}

async function readLocalDb(): Promise<LocalDb> {
  try {
    return JSON.parse(await readFile(LOCAL_DB_PATH, 'utf8')) as LocalDb;
  } catch {
    return {};
  }
}

async function writeLocalDb(data: LocalDb) {
  await mkdir(path.dirname(LOCAL_DB_PATH), { recursive: true });
  await writeFile(LOCAL_DB_PATH, JSON.stringify(data, null, 2));
}

function tableItems(data: LocalDb, table: string) {
  data[table] ??= [];
  return data[table];
}

function matchesKey(item: LocalItem, key: Record<string, unknown>) {
  return Object.entries(key).every(([field, value]) => item[field] === value);
}

function keyFieldsForTable(table: string) {
  switch (table) {
    case Tables.CHAT_HISTORY:
      return ['farmer_id', 'timestamp'];
    case Tables.CROP_PLANS:
      return ['farmer_id', 'created_at'];
    case Tables.SOIL_REPORTS:
      return ['farmer_id', 'uploaded_at'];
    case Tables.GOVERNMENT_SCHEMES:
      return ['scheme_id'];
    case Tables.FARMER_PROFILES:
    default:
      return ['farmer_id'];
  }
}

async function localPutItem(table: string, item: LocalItem) {
  const data = await readLocalDb();
  const items = tableItems(data, table);
  const key = Object.fromEntries(keyFieldsForTable(table).map((field) => [field, item[field]]));
  const existingIndex = items.findIndex((stored) => matchesKey(stored, key));
  if (existingIndex >= 0) {
    items[existingIndex] = item;
  } else {
    items.push(item);
  }
  await writeLocalDb(data);
}

async function localGetItem(table: string, key: Record<string, unknown>) {
  const data = await readLocalDb();
  return tableItems(data, table).find((item) => matchesKey(item, key)) ?? null;
}

function localQueryMatches(item: LocalItem, input: QueryCommandInput) {
  const values = input.ExpressionAttributeValues as Record<string, unknown> | undefined;
  if (!input.KeyConditionExpression || !values) return true;

  const conditions = input.KeyConditionExpression.split(/\s+AND\s+/i);
  return conditions.every((condition) => {
    const match = condition.trim().match(/^([A-Za-z0-9_#]+)\s*=\s*(:[A-Za-z0-9_]+)/);
    if (!match) return true;
    const [, rawField, valueKey] = match;
    const names = input.ExpressionAttributeNames as Record<string, string> | undefined;
    const field = rawField.startsWith('#') ? names?.[rawField] : rawField;
    return field ? item[field] === values[valueKey] : true;
  });
}

async function localQueryItems(input: QueryCommandInput) {
  if (!input.TableName) return [];
  const data = await readLocalDb();
  let results = tableItems(data, input.TableName).filter((item) => localQueryMatches(item, input));
  if (input.ScanIndexForward === false) results = [...results].reverse();
  return typeof input.Limit === 'number' ? results.slice(0, input.Limit) : results;
}

async function localUpdateItem(input: UpdateCommandInput) {
  if (!input.TableName || !input.Key) return;
  const data = await readLocalDb();
  const items = tableItems(data, input.TableName);
  const index = items.findIndex((item) => matchesKey(item, input.Key as Record<string, unknown>));
  if (index < 0) return;

  const values = input.ExpressionAttributeValues as Record<string, unknown> | undefined;
  if (!input.UpdateExpression?.startsWith('SET ') || !values) return;

  const names = input.ExpressionAttributeNames as Record<string, string> | undefined;
  for (const update of input.UpdateExpression.slice(4).split(',')) {
    const match = update.trim().match(/^([A-Za-z0-9_#]+)\s*=\s*(:[A-Za-z0-9_]+)/);
    if (!match) continue;
    const [, rawField, valueKey] = match;
    const field = rawField.startsWith('#') ? names?.[rawField] : rawField;
    if (field) items[index][field] = values[valueKey];
  }

  await writeLocalDb(data);
}

async function localDeleteItem(table: string, key: Record<string, unknown>) {
  const data = await readLocalDb();
  data[table] = tableItems(data, table).filter((item) => !matchesKey(item, key));
  await writeLocalDb(data);
}

async function withLocalFallback<T>(awsOperation: () => Promise<T>, localOperation: () => Promise<T>) {
  if (useLocalDb) return localOperation();
  try {
    return await awsOperation();
  } catch (err) {
    if (!shouldUseLocalFallback(err)) throw err;
    useLocalDb = true;
    console.warn('DynamoDB credentials not found. Using local development database at .local-db/dynamodb.json.');
    return localOperation();
  }
}

export async function putItem(table: string, item: Record<string, unknown>) {
  const input: PutCommandInput = { TableName: table, Item: item };
  return withLocalFallback(
    () => db.send(new PutCommand(input)),
    async () => {
      await localPutItem(table, item);
      return {};
    }
  );
}

export async function getItem(table: string, key: Record<string, unknown>) {
  const input: GetCommandInput = { TableName: table, Key: key };
  return withLocalFallback(
    async () => {
      const res = await db.send(new GetCommand(input));
      return res.Item ?? null;
    },
    () => localGetItem(table, key)
  );
}

export async function queryItems(input: QueryCommandInput) {
  return withLocalFallback(
    async () => {
      const res = await db.send(new QueryCommand(input));
      return res.Items ?? [];
    },
    () => localQueryItems(input)
  );
}

export async function updateItem(input: UpdateCommandInput) {
  return withLocalFallback(
    () => db.send(new UpdateCommand(input)),
    async () => {
      await localUpdateItem(input);
      return {};
    }
  );
}

export async function deleteItem(table: string, key: Record<string, unknown>) {
  return withLocalFallback(
    () => db.send(new DeleteCommand({ TableName: table, Key: key })),
    async () => {
      await localDeleteItem(table, key);
      return {};
    }
  );
}

export async function scanItems(table: string) {
  return withLocalFallback(
    async () => {
      const res = await db.send(new ScanCommand({ TableName: table }));
      return res.Items ?? [];
    },
    async () => {
      const data = await readLocalDb();
      return tableItems(data, table);
    }
  );
}
