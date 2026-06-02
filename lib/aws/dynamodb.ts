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

const client = new DynamoDBClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });
export const db = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

export const Tables = {
  FARMER_PROFILES: 'farmer_profiles',
  CHAT_HISTORY: 'chat_history',
  CROP_PLANS: 'crop_plans',
  SOIL_REPORTS: 'soil_reports',
  GOVERNMENT_SCHEMES: 'government_schemes',
} as const;

export async function putItem(table: string, item: Record<string, unknown>) {
  const input: PutCommandInput = { TableName: table, Item: item };
  return db.send(new PutCommand(input));
}

export async function getItem(table: string, key: Record<string, unknown>) {
  const input: GetCommandInput = { TableName: table, Key: key };
  const res = await db.send(new GetCommand(input));
  return res.Item ?? null;
}

export async function queryItems(input: QueryCommandInput) {
  const res = await db.send(new QueryCommand(input));
  return res.Items ?? [];
}

export async function updateItem(input: UpdateCommandInput) {
  return db.send(new UpdateCommand(input));
}

export async function deleteItem(table: string, key: Record<string, unknown>) {
  return db.send(new DeleteCommand({ TableName: table, Key: key }));
}

export async function scanItems(table: string) {
  const res = await db.send(new ScanCommand({ TableName: table }));
  return res.Items ?? [];
}
