/** Flatten the catalogue's lightweight Markdown into clean, readable plain text. */
export function cleanSchemeText(s?: string): string {
  if (!s) return '';
  return String(s)
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold markers
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*[-*]\s+/gm, '• ') // bullets
    .replace(/_([^_]+)_/g, '$1') // italics
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** A one-line preview of a (possibly Markdown) field. */
export function snippet(s: string | undefined, n = 110): string {
  const t = cleanSchemeText(s).replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n).trimEnd()}…` : t;
}
