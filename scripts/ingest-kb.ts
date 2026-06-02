/**
 * Knowledge-base ingestion: read docs from the S3 KB bucket, chunk, embed with
 * OpenAI, and upsert into Qdrant. Idempotent — re-running updates existing
 * points (deterministic IDs per `key#chunkIndex`).
 *
 * Run:  npx tsx scripts/ingest-kb.ts
 * Env:  OPENAI_API_KEY, OPENAI_EMBED_MODEL, AWS creds, AWS_REGION,
 *       S3_BUCKET_KB, QDRANT_URL, QDRANT_COLLECTION
 *
 * Supports .txt and .md natively. PDFs are parsed if `pdf-parse` is installed;
 * otherwise they are skipped with a warning.
 */
import { createHash } from 'crypto';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { embedBatch } from '../lib/ai/openai';
import { ensureCollection, upsertChunks, type ChunkPoint } from '../lib/ai/vectorstore';

const region = process.env.AWS_REGION ?? 'ap-south-1';
const bucket = process.env.S3_BUCKET_KB ?? 'farm-advisor-kb-docs';
const s3 = new S3Client({ region });

const CHUNK_CHARS = 2000; // ~500 tokens
const OVERLAP_CHARS = 200;
const EMBED_BATCH = 64;

async function listKeys(): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: token })
    );
    for (const obj of res.Contents ?? []) {
      if (obj.Key && !obj.Key.endsWith('/')) keys.push(obj.Key);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

async function getObjectBuffer(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

async function extractText(key: string, buf: Buffer): Promise<string> {
  const lower = key.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) {
    return buf.toString('utf-8');
  }
  if (lower.endsWith('.pdf')) {
    try {
      // Import the lib entry directly to avoid pdf-parse's debug-mode side effect
      // when its index is required as the main module.
      const mod = 'pdf-parse/lib/pdf-parse.js';
      const pdfParse = (await import(mod)).default as (b: Buffer) => Promise<{ text: string }>;
      const data = await pdfParse(buf);
      return data.text;
    } catch (err) {
      console.warn(`  ! PDF parse failed, skipping: ${key} (${(err as Error).message})`);
      return '';
    }
  }
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.read(buf, { type: 'buffer' });
      // Flatten every sheet to CSV, prefixed with the sheet name for context.
      return wb.SheetNames.map((name) => {
        const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
        return `# Sheet: ${name}\n${csv}`;
      }).join('\n\n');
    } catch (err) {
      console.warn(`  ! Excel parse failed, skipping: ${key} (${(err as Error).message})`);
      return '';
    }
  }
  console.warn(`  ! Unsupported file type, skipping: ${key}`);
  return '';
}

function chunkText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    const end = Math.min(start + CHUNK_CHARS, clean.length);
    chunks.push(clean.slice(start, end));
    if (end === clean.length) break;
    start = end - OVERLAP_CHARS;
  }
  return chunks;
}

/** Deterministic numeric-safe id from key + chunk index (Qdrant accepts UUID or unsigned int). */
function pointId(key: string, idx: number): string {
  const hash = createHash('sha1').update(`${key}#${idx}`).digest('hex');
  // Format as a UUID-like string (Qdrant accepts UUIDs as point ids).
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

async function main() {
  console.log(`Ingesting from s3://${bucket}/ into Qdrant…`);
  await ensureCollection();

  const keys = await listKeys();
  console.log(`Found ${keys.length} object(s).`);

  let totalChunks = 0;
  for (const key of keys) {
    const buf = await getObjectBuffer(key);
    const text = await extractText(key, buf);
    const chunks = chunkText(text);
    if (chunks.length === 0) continue;

    for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
      const batch = chunks.slice(i, i + EMBED_BATCH);
      const vectors = await embedBatch(batch);
      const points: ChunkPoint[] = batch.map((chunk, j) => ({
        id: pointId(key, i + j),
        vector: vectors[j],
        text: chunk,
        source: key,
      }));
      await upsertChunks(points);
    }
    totalChunks += chunks.length;
    console.log(`  ✓ ${key} — ${chunks.length} chunk(s)`);
  }

  console.log(`Done. Upserted ${totalChunks} chunk(s) from ${keys.length} object(s).`);
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
