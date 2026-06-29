import { matchSchemes } from './match';
import { buildFarmerFacts } from './facts';
import { snippet } from './format';

/**
 * Build a compact, prompt-ready summary of the government schemes a farmer
 * likely qualifies for. Used by the shared chat engine so both the web chat and
 * the WhatsApp bot can answer scheme/subsidy questions from real, matched data
 * (not invented schemes). Only 'eligible'/'likely' matches are included.
 */
export function buildSchemesPromptContext(
  profile: Record<string, unknown> | null | undefined,
  cropPlans?: Array<Record<string, unknown>>,
  limit = 6,
): string {
  const facts = buildFarmerFacts(profile, cropPlans);
  const matches = matchSchemes(facts).filter((m) => m.status !== 'check').slice(0, limit);
  if (!matches.length) return '';

  return matches
    .map((m, i) => {
      const s = m.scheme;
      const lines = [
        `${i + 1}. ${s.name} (${s.level === 'Central' ? 'Central' : 'Tamil Nadu'})`,
        `   Benefit: ${snippet(s.benefits, 160)}`,
        `   Why eligible: ${m.matchedOn.join('; ')}`,
      ];
      if (m.unknownConditions.length) lines.push(`   To confirm: ${m.unknownConditions.slice(0, 3).join('; ')}`);
      const apply = s.process?.find((p) => p.md)?.md;
      if (apply) lines.push(`   How to apply: ${snippet(apply, 130)}`);
      if (s.documents) lines.push(`   Documents: ${snippet(s.documents, 140)}`);
      if (s.references?.[0]?.url) lines.push(`   Source: ${s.references[0].url}`);
      return lines.join('\n');
    })
    .join('\n');
}
