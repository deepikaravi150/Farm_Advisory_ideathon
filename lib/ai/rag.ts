import { embedText } from './openai';
import { searchSimilar } from './vectorstore';

/**
 * Retrieve relevant knowledge-base context for a query.
 * Returns a formatted string of the top-k chunks (with their sources), or an
 * empty string if nothing is found or the vector store is unavailable — so the
 * caller can gracefully fall back to an ungrounded answer.
 */
export async function retrieveContext(query: string, k = 5): Promise<string> {
  try {
    const vector = await embedText(query);
    const hits = await searchSimilar(vector, k);
    if (hits.length === 0) return '';
    return hits
      .map((h, i) => `[${i + 1}] (source: ${h.source})\n${h.text}`)
      .join('\n\n');
  } catch (err) {
    console.error('RAG retrieve error:', err);
    return '';
  }
}
