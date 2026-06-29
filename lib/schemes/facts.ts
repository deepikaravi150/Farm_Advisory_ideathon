import type { FarmerFacts, Gender } from './types';

/**
 * Build the facts the scheme matcher needs from a DynamoDB farmer profile item
 * and (optionally) their crop plans. Shared by the schemes API and the chat
 * engine so both match on identical inputs.
 */
export function buildFarmerFacts(
  profile: Record<string, unknown> | null | undefined,
  cropPlans?: Array<Record<string, unknown>>,
): FarmerFacts {
  const p = profile ?? {};

  const crops = new Set<string>();
  for (const plan of cropPlans ?? []) {
    const c = plan?.crop_name;
    if (typeof c === 'string' && c.trim()) crops.add(c.trim());
  }

  const acresRaw = p.land_area_acres;
  const landAreaAcres =
    typeof acresRaw === 'number' ? acresRaw :
    acresRaw != null && !Number.isNaN(Number(acresRaw)) ? Number(acresRaw) : null;

  return {
    district: typeof p.district === 'string' ? p.district : null,
    landAreaAcres,
    crops: [...crops],
    community: typeof p.community === 'string' && p.community ? p.community : null,
    gender: p.gender === 'male' || p.gender === 'female' ? (p.gender as Gender) : null,
    age: typeof p.age === 'number' ? p.age : null,
    annualIncome: typeof p.annual_income === 'number' ? p.annual_income : null,
  };
}
