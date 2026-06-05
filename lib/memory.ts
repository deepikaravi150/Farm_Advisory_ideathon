/**
 * Persistent farmer memory: a small, growing set of durable facts we learn about
 * a farmer from their interactions (mostly chat). Stored as a `memory` attribute
 * on the FARMER_PROFILES item and injected into LLM prompts so advice stays
 * personalized without depending on raw chat history.
 *
 * Pure helpers only — no AWS or OpenAI imports, so this is safe to use anywhere.
 */

export type MemoryCategory =
  | 'crop' | 'land' | 'irrigation' | 'soil' | 'pest' | 'preference' | 'other';

export interface Fact {
  id: string;
  /** One concise factual sentence (stored in English for the LLM). */
  text: string;
  category: MemoryCategory;
  /** ISO timestamp of when the fact was last added/updated. */
  updatedAt: string;
}

export const MEMORY_CATEGORIES: MemoryCategory[] =
  ['crop', 'land', 'irrigation', 'soil', 'pest', 'preference', 'other'];

/** Hard cap so the profile item stays small and well under DynamoDB's 400KB limit. */
export const MAX_FACTS = 40;

export function isMemoryCategory(value: unknown): value is MemoryCategory {
  return typeof value === 'string' && (MEMORY_CATEGORIES as string[]).includes(value);
}

/** Most-recent facts first, trimmed to MAX_FACTS. */
export function capFacts(facts: Fact[]): Fact[] {
  return [...facts]
    .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
    .slice(0, MAX_FACTS);
}

/**
 * Render the memory as a system-prompt block. Returns '' when there are no facts
 * so callers can conditionally include it.
 */
export function formatMemoryForPrompt(facts?: Fact[] | null): string {
  if (!facts?.length) return '';
  const lines = facts
    .filter((f) => f && typeof f.text === 'string' && f.text.trim())
    .map((f) => `- [${f.category}] ${f.text.trim()}`);
  if (!lines.length) return '';
  return `What we know about this farmer (persistent memory):\n${lines.join('\n')}`;
}
