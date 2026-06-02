import { QdrantClient } from '@qdrant/js-client-rest';

const url = process.env.QDRANT_URL ?? 'http://localhost:6333';
const collection = process.env.QDRANT_COLLECTION ?? 'farm_docs';
const VECTOR_SIZE = 1536; // text-embedding-3-small

const client = new QdrantClient({ url });

export interface ChunkPoint {
  id: string | number;
  vector: number[];
  text: string;
  source: string;
}

export interface SearchHit {
  text: string;
  source: string;
  score: number;
}

/** Create the collection if it does not already exist. Safe to call repeatedly. */
export async function ensureCollection(): Promise<void> {
  const existing = await client.getCollections();
  if (existing.collections.some((c) => c.name === collection)) return;
  await client.createCollection(collection, {
    vectors: { size: VECTOR_SIZE, distance: 'Cosine' },
  });
}

export async function upsertChunks(points: ChunkPoint[]): Promise<void> {
  if (points.length === 0) return;
  await client.upsert(collection, {
    wait: true,
    points: points.map((p) => ({
      id: p.id,
      vector: p.vector,
      payload: { text: p.text, source: p.source },
    })),
  });
}

export async function searchSimilar(queryVector: number[], k = 5): Promise<SearchHit[]> {
  const res = await client.search(collection, {
    vector: queryVector,
    limit: k,
    with_payload: true,
  });
  return res.map((r) => ({
    text: String(r.payload?.text ?? ''),
    source: String(r.payload?.source ?? ''),
    score: r.score,
  }));
}
