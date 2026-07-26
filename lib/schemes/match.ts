/**
 * Scheme matching engine.
 *
 * Given a farmer's facts, rank every scheme as:
 *   - 'eligible' : all the structured criteria we can check pass, with no
 *                  unknown gating left.
 *   - 'likely'   : passes what we know, but a soft detail (e.g. their crop) is
 *                  unknown for a crop-specific scheme.
 *   - 'check'    : a hard gating field (district / community / gender / age /
 *                  income / occupation) is unknown or needs the farmer's input.
 *
 * Hard mismatches on KNOWN fields exclude the scheme entirely. Unknown fields
 * never exclude — they downgrade the status and surface as `unknownConditions`
 * so the farmer knows what to confirm. `otherConditions` from the catalogue are
 * shown for transparency but don't change the status.
 */
import { getAllSchemes } from './store';
import type {
  Scheme,
  SchemeMatch,
  FarmerFacts,
  MatchStatus,
  LandSizeClass,
  Community,
} from './types';

const ACRES_PER_HA = 2.47105;

/** Indian land-holding class from acreage (1 ha = 2.471 ac). */
export function landSizeClass(acres?: number | null): LandSizeClass | null {
  if (acres == null || !(acres > 0)) return null;
  if (acres < 1 * ACRES_PER_HA) return 'marginal';
  if (acres < 2 * ACRES_PER_HA) return 'small';
  if (acres < 4 * ACRES_PER_HA) return 'semi-medium';
  if (acres < 10 * ACRES_PER_HA) return 'medium';
  return 'large';
}

// District names in the catalogue use a few colloquial spellings; normalise both
// sides to a canonical key before comparing.
const DISTRICT_ALIAS: Record<string, string> = {
  trichy: 'tiruchirappalli',
  tiruchirapalli: 'tiruchirappalli',
  tiruchirapally: 'tiruchirappalli',
  tiruchi: 'tiruchirappalli',
  sivagangai: 'sivaganga',
  villupuram: 'viluppuram',
  vilupuram: 'viluppuram',
  tuticorin: 'thoothukudi',
  thethukudi: 'thoothukudi',
};

function normDistrict(d?: string | null): string {
  const k = String(d ?? '').toLowerCase().replace(/[^a-z]/g, '');
  return DISTRICT_ALIAS[k] ?? k;
}

/** Map a free-text community/category to the catalogue's community tokens. */
function communityTokens(c?: string | null): Set<Community> {
  const t = new Set<Community>();
  const s = String(c ?? '').toLowerCase();
  if (!s) return t;
  if (/adi dravidar|scheduled caste|\bsc\b/.test(s)) t.add('SC');
  if (/scheduled tribe|\bst\b/.test(s)) { t.add('ST'); t.add('Tribal'); }
  if (/tribal|tribe/.test(s)) { t.add('Tribal'); t.add('ST'); }
  if (/most backward|\bmbc\b/.test(s)) t.add('MBC');
  else if (/backward|\bbc\b/.test(s)) t.add('BC');
  if (/denotified|\bdnc\b/.test(s)) t.add('DNC');
  if (/minorit/.test(s)) t.add('Minority');
  if (/general|forward|\boc\b/.test(s)) t.add('General');
  return t;
}

// Conditions that are baseline-true for every registered TN farmer — drop them
// from the "to confirm" list so it stays signal, not noise.
const BASELINE_CONDITION =
  /(resident|residing|residence).{0,20}tamil nadu|tamil nadu.{0,20}resident|(should|must|be)\b.{0,12}\bfarmer\b/i;

const STATUS_RANK: Record<MatchStatus, number> = { eligible: 0, likely: 1, check: 2 };

function matchOne(scheme: Scheme, facts: FarmerFacts): SchemeMatch | null {
  const c = scheme.criteria;
  const matchedOn: string[] = [];
  const unknown: string[] = [];
  let status: MatchStatus = 'eligible';
  const downgrade = (s: MatchStatus) => { if (STATUS_RANK[s] > STATUS_RANK[status]) status = s; };

  // Occupation — this catalogue is farmer-focused; flag (don't exclude) schemes
  // that clearly target a different occupation.
  if (c.occupations.length && !c.occupations.some((o) => /farmer/i.test(o))) {
    unknown.push(`Mainly for: ${c.occupations.join(', ')}`);
    downgrade('check');
  }

  // District — hard filter when the scheme is district-restricted.
  if (c.districts && c.districts.length) {
    const allowed = new Set(c.districts.map(normDistrict));
    const fd = normDistrict(facts.district);
    if (fd) {
      if (allowed.has(fd)) matchedOn.push('Available in your district');
      else return null;
    } else {
      unknown.push(`Only in: ${c.districts.join(', ')}`);
      downgrade('check');
    }
  }

  // Crop — hard filter when crop-specific and the farmer's crop is known.
  if (c.crops && c.crops.length) {
    const want = c.crops.map((x) => x.toLowerCase());
    const have = (facts.crops ?? []).map((x) => x.toLowerCase()).filter(Boolean);
    if (have.length) {
      const hit = have.some((h) => want.some((w) => h.includes(w) || w.includes(h)));
      if (hit) matchedOn.push(`Matches your crop (${c.crops.join('/')})`);
      else return null;
    } else {
      unknown.push(`For ${c.crops.join('/')} growers`);
      downgrade('likely');
    }
  }

  // Community.
  if (c.communities && c.communities.length) {
    const need = new Set(c.communities);
    const have = communityTokens(facts.community);
    const overlap = [...have].some((h) => need.has(h));
    if (c.communityIsPreferenceOnly) {
      if (overlap) matchedOn.push('Priority given to your community');
    } else if (have.size) {
      if (overlap) matchedOn.push('Matches required community');
      else return null;
    } else {
      unknown.push(`Requires community: ${c.communities.join('/')}`);
      downgrade('check');
    }
  }

  // Gender.
  if (c.gender) {
    if (facts.gender) {
      if (facts.gender === c.gender) matchedOn.push(`For ${c.gender} farmers`);
      else return null;
    } else {
      unknown.push(`For ${c.gender} applicants`);
      downgrade('check');
    }
  }

  // Age.
  if (c.ageMin != null || c.ageMax != null) {
    if (facts.age != null) {
      const okMin = c.ageMin == null || facts.age >= c.ageMin;
      const okMax = c.ageMax == null || facts.age <= c.ageMax;
      if (okMin && okMax) matchedOn.push('Age criteria met');
      else return null;
    } else {
      const range =
        c.ageMin != null && c.ageMax != null ? `${c.ageMin}–${c.ageMax}` :
        c.ageMin != null ? `${c.ageMin}+` : `up to ${c.ageMax}`;
      unknown.push(`Age requirement: ${range}`);
      downgrade('check');
    }
  }

  // Income.
  if (c.incomeMaxAnnual != null) {
    if (facts.annualIncome != null) {
      if (facts.annualIncome <= c.incomeMaxAnnual) matchedOn.push('Within income limit');
      else return null;
    } else {
      unknown.push(`Annual income must be ≤ ₹${c.incomeMaxAnnual.toLocaleString('en-IN')}`);
      downgrade('check');
    }
  }

  // Land size — soft preference; never excludes.
  if (c.landSizeClass && c.landSizeClass.length) {
    const cls = landSizeClass(facts.landAreaAcres);
    if (cls && c.landSizeClass.includes(cls)) matchedOn.push('Suited to your land size');
  }

  // Remaining unstructured conditions — informational only.
  for (const oc of c.otherConditions) {
    if (!BASELINE_CONDITION.test(oc)) unknown.push(oc);
  }

  if (!matchedOn.length && status === 'eligible') {
    matchedOn.push(scheme.level === 'Central' ? 'Open to farmers across India' : 'Open to Tamil Nadu farmers');
  }

  const benefitsText = `${scheme.benefits} ${scheme.category ?? ''}`.toLowerCase();
  const financial = /subsid|financial|loan|insurance|pension|₹|assistance|grant/.test(benefitsText);
  const base = status === 'eligible' ? 100 : status === 'likely' ? 65 : 35;
  const score = base + matchedOn.length * 6 + (financial ? 8 : 0) - Math.min(unknown.length, 6);

  return { scheme, status, matchedOn, unknownConditions: unknown, score };
}

export function matchSchemes(facts: FarmerFacts, schemes: Scheme[] = getAllSchemes()): SchemeMatch[] {
  const out: SchemeMatch[] = [];
  for (const s of schemes) {
    const m = matchOne(s, facts);
    if (m) out.push(m);
  }
  out.sort((a, b) => b.score - a.score || a.scheme.name.localeCompare(b.scheme.name));
  return out;
}
