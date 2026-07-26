/**
 * Dedupe / rotation store for peer insights.
 *
 * One row per (farmer, insight) in the `peer_insights` table (PK farmer_id,
 * SK insight_key) records when an insight was sent and a cooldown until which it
 * must not repeat — so the weekly push rotates to the next unseen insight instead
 * of spamming the same one. Mirrors the pest_alerts cooldown model.
 */
import { queryItems, putItem, Tables } from '@/lib/aws/dynamodb';
import type { Insight } from './peer-insights';

const COOLDOWN_DAYS = Number(process.env.PEER_INSIGHT_COOLDOWN_DAYS) || 30;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

/** Insight keys still on cooldown for a farmer (i.e. must not be re-sent yet). */
export async function getSentInsightKeys(farmerId: string): Promise<Set<string>> {
  const rows = await queryItems({
    TableName: Tables.PEER_INSIGHTS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
  }).catch(() => []);
  const now = Date.now();
  const keys = new Set<string>();
  for (const r of rows) {
    if (Number(r.cooldown_until ?? 0) > now) keys.add(String(r.insight_key));
  }
  return keys;
}

/** Record that an insight was pushed, starting its cooldown. */
export async function recordInsightSent(farmerId: string, insight: Insight): Promise<void> {
  const now = Date.now();
  await putItem(Tables.PEER_INSIGHTS, {
    farmer_id: farmerId,
    insight_key: insight.key,
    type: insight.type,
    crop: insight.crop ?? '',
    scheme_name: insight.schemeName ?? '',
    sent_at: new Date(now).toISOString(),
    cooldown_until: now + COOLDOWN_MS,
  });
}
