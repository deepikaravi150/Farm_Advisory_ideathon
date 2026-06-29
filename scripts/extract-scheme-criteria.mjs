/**
 * extract-scheme-criteria.mjs
 * ---------------------------------------------------------------------------
 * Turns the human-readable TN farmer-scheme reference into a STRUCTURED
 * eligibility catalogue the app can match against a farmer's profile.
 *
 * Source (in order of preference):
 *   1. lib/data/tn-schemes.raw.json   (emitted by crawl-tn-farmer-schemes.mjs)
 *   2. tamil-nadu-farmer-schemes.md   (parsed as a fallback, so this works
 *      offline without re-crawling myScheme)
 *
 * For each scheme it asks the LLM (OpenAI, JSON mode, batched) to distil the
 * free-text eligibility into a `criteria` object (districts, crops, land size,
 * community, gender, age, income, …). If the LLM is unavailable it falls back to
 * a deterministic heuristic so the catalogue is never empty.
 *
 * Out: lib/data/tn-schemes.json   (committed; consumed by lib/schemes/store.ts)
 *
 * Run:  node scripts/extract-scheme-criteria.mjs
 * Env:  OPENAI_API_KEY (+ optional OPENAI_CHAT_MODEL). Read from .env.local too.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const RAW_IN = 'lib/data/tn-schemes.raw.json';
const MD_IN = 'tamil-nadu-farmer-schemes.md';
const OUT = process.argv[2] || 'lib/data/tn-schemes.json';

// ---- env (.env.local) ------------------------------------------------------

function loadEnvLocal() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}
loadEnvLocal();

const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-5.2';

// ---- Tamil Nadu districts (with common aliases) ----------------------------

const TN_DISTRICTS = [
  'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri',
  'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur',
  'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal',
  'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem',
  'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli',
  'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai',
  'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar',
];
// alias -> canonical
const DISTRICT_ALIASES = {
  trichy: 'Tiruchirappalli', tiruchirapalli: 'Tiruchirappalli', tiruchi: 'Tiruchirappalli',
  sivagangai: 'Sivaganga', villupuram: 'Viluppuram', thoothukudi: 'Thoothukudi',
  tuticorin: 'Thoothukudi', vilupuram: 'Viluppuram',
};

// ---- crop keywords ---------------------------------------------------------

const CROP_KEYWORDS = [
  'Maize', 'Pulses', 'Oilseeds', 'Oil Seeds', 'Groundnut', 'Paddy', 'Rice',
  'Cotton', 'Millet', 'Millets', 'Tea', 'Coffee', 'Coconut', 'Cardamom',
  'Oil Palm', 'Spices', 'Sugarcane', 'Sericulture', 'Horticulture',
];
const CROP_CANON = { 'oil seeds': 'Oilseeds', rice: 'Paddy', millet: 'Millets' };

// ---- markdown fallback parser ----------------------------------------------

function parseMarkdown(md) {
  const out = [];
  // Split into scheme blocks at each "### N. Title" heading.
  const parts = md.split(/^###\s+\d+\.\s+/m).slice(1);
  let currentLevel = 'State';
  // Detect which big section each block belongs to by scanning the original text.
  const centralIdx = md.indexOf('## Central Government Schemes');
  let cursor = md.indexOf('### '); // not exact, but level is also in the meta line
  for (const block of parts) {
    const lines = block.split('\n');
    const title = lines[0].trim();
    const short = (title.match(/\(([^)]+)\)\s*$/) || [])[1] || '';
    const name = title.replace(/\s*\([^)]+\)\s*$/, '').trim();

    const sectionText = block;
    const slug = (sectionText.match(/myscheme\.gov\.in\/schemes\/([a-z0-9-]+)/i) || [])[1] || slugify(name);
    const level = /\*\*Level:\*\*\s*Central/i.test(sectionText) ? 'Central' : 'State';

    const meta = (sectionText.match(/\*\*Level:\*\*[^\n]*/) || [''])[0];
    const department = (meta.match(/\*\*Dept\/Ministry:\*\*\s*([^·]+)/) || [])[1]?.trim() || '';
    const category = (meta.match(/\*\*Category:\*\*\s*([^·]+)/) || [])[1]?.trim() || '';
    const subCategory = (meta.match(/\*\*Sub-category:\*\*\s*([^·\n]+)/) || [])[1]?.trim() || '';

    out.push({
      slug, name, short, level,
      state: level === 'Central' ? '' : 'Tamil Nadu',
      department, category, subCategory,
      brief: section(sectionText, null, '💰 Benefits').replace(/^[^\n]*\n/, '').trim(),
      benefits: section(sectionText, '💰 Benefits', '✅ Eligibility'),
      eligibility: section(sectionText, '✅ Eligibility', ['🚫 Exclusions', '📝 How to Apply']),
      exclusions: section(sectionText, '🚫 Exclusions', '📝 How to Apply'),
      process: [{ mode: '', md: section(sectionText, '📝 How to Apply', ['📄 Documents Required', '🔗 Source']) }],
      documents: section(sectionText, '📄 Documents Required', '🔗 Source'),
      references: parseRefs(sectionText),
    });
  }
  void cursor; void centralIdx; void currentLevel;
  return out;
}

function section(text, startLabel, endLabel) {
  const ends = Array.isArray(endLabel) ? endLabel : endLabel ? [endLabel] : [];
  const startRe = startLabel ? new RegExp(`\\*\\*${escapeRe(startLabel)}\\*\\*`) : null;
  let from = 0;
  if (startRe) {
    const m = text.match(startRe);
    if (!m) return '';
    from = m.index + m[0].length;
  }
  let to = text.length;
  for (const e of ends) {
    const m = text.slice(from).match(new RegExp(`\\*\\*${escapeRe(e)}\\*\\*`));
    if (m) to = Math.min(to, from + m.index);
  }
  return text.slice(from, to).replace(/\n*---\n*$/, '').trim();
}

function parseRefs(text) {
  const refs = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;
  let m;
  const sourceLine = (text.match(/\*\*🔗 Source:\*\*[^\n]*/) || [''])[0];
  while ((m = re.exec(sourceLine))) refs.push({ title: m[1].trim(), url: m[2].trim() });
  return refs;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// ---- heuristic criteria (fallback) -----------------------------------------

function heuristicCriteria(rec) {
  const text = `${rec.eligibility}\n${rec.brief}\n${rec.category}`.toLowerCase();
  const elig = (rec.eligibility || '').toLowerCase();

  const occupations = [];
  if (/\bfarmer/.test(text)) occupations.push('Farmer');
  if (/fisherm|fishing|fisher/.test(text)) occupations.push('Fishermen');
  if (/agricultural lab/.test(text)) occupations.push('Agricultural labourer');
  if (/\bmsme\b|micro, small|manufacturing enterprise/.test(text)) occupations.push('MSME');
  if (/\bstudent\b|boarder|standard/.test(text)) occupations.push('Student');

  // districts: collect known TN districts mentioned; treat as a restriction only
  // when several are listed (a lone "resident of Tamil Nadu" isn't a restriction).
  const found = new Set();
  for (const d of TN_DISTRICTS) if (new RegExp(`\\b${escapeRe(d)}\\b`, 'i').test(elig)) found.add(d);
  for (const [a, canon] of Object.entries(DISTRICT_ALIASES)) if (new RegExp(`\\b${a}\\b`, 'i').test(elig)) found.add(canon);
  const districts = found.size >= 3 ? [...found] : null;

  // crops
  const crops = new Set();
  for (const c of CROP_KEYWORDS) {
    if (new RegExp(`\\b${escapeRe(c)}\\b`, 'i').test(elig)) {
      const canon = CROP_CANON[c.toLowerCase()] || c;
      crops.add(canon);
    }
  }

  // land size (almost always a soft preference in these schemes)
  let landSizeClass = null;
  let communityIsPreferenceOnly = false;
  if (/small\s*\/?\s*marginal|marginal\s*farmer|small\s*farmer/.test(elig)) {
    landSizeClass = ['marginal', 'small'];
    if (/preference|preferen|flow to|priority/.test(elig)) communityIsPreferenceOnly = true;
  }

  // communities
  const communities = new Set();
  if (/\bsc\b|scheduled caste|adi dravidar/.test(elig)) communities.add('SC');
  if (/\bst\b|scheduled tribe/.test(elig)) communities.add('ST');
  if (/tribal|tribe/.test(elig)) communities.add('Tribal');
  if (/\bmbc\b|most backward/.test(elig)) communities.add('MBC');
  if (/\bbc\b|backward class/.test(elig)) communities.add('BC');
  if (/\bdnc\b|denotified/.test(elig)) communities.add('DNC');
  if (/minorit/.test(elig)) communities.add('Minority');
  const commPrefOnly = /preference|flow to|priority|ensured/.test(elig);

  // gender (only when clearly restricted)
  let gender = null;
  if (/women[- ]?only|only women|women farmers? only|exclusively (?:for )?women/.test(elig)) gender = 'female';

  // age
  let ageMin = null, ageMax = null;
  const ageM = elig.match(/(\d{2})\s*years?\s*(?:and|or)?\s*(?:above|more|older)/);
  if (ageM) ageMin = parseInt(ageM[1], 10);

  // income cap
  let incomeMaxAnnual = null;
  const incM = elig.match(/(?:income[^.]{0,40}?)(?:₹|rs\.?|inr)?\s*([\d,]{4,})/);
  if (incM && /income/.test(elig)) incomeMaxAnnual = parseInt(incM[1].replace(/,/g, ''), 10) || null;

  return {
    level: rec.level === 'Central' ? 'Central' : 'State',
    occupations: occupations.length ? [...new Set(occupations)] : (/\bfarmer/.test(rec.category?.toLowerCase() || '') ? ['Farmer'] : []),
    districts,
    crops: crops.size ? [...crops] : null,
    landSizeClass,
    communities: communities.size ? [...communities] : null,
    communityIsPreferenceOnly: communities.size ? commPrefOnly : communityIsPreferenceOnly,
    gender,
    ageMin,
    ageMax,
    incomeMaxAnnual,
    otherConditions: [],
  };
}

// ---- LLM extraction (batched) ----------------------------------------------

const SYSTEM = `You convert Indian government farmer-scheme eligibility text into STRUCTURED JSON filters used to match schemes to a farmer's profile.

For each scheme you are given, output a "criteria" object. STRICT RULES:
- Only set a restriction when the eligibility text explicitly states it. Otherwise use null (districts, crops, landSizeClass, communities, gender, ageMin, ageMax, incomeMaxAnnual) or [] (occupations, otherConditions). Never invent districts, crops, or amounts.
- occupations: who the scheme targets, e.g. ["Farmer"], ["Fishermen"], ["Agricultural labourer"], ["MSME"], ["Student"]. Use ["Farmer"] when it is for farmers.
- districts: array of Tamil Nadu district names exactly when the scheme is limited to specific districts; null if it covers all of Tamil Nadu or is not district-restricted.
- crops: array of crop names the scheme is tied to (e.g. ["Maize"], ["Pulses"], ["Oilseeds"], ["Groundnut"], ["Tea"], ["Coffee"], ["Coconut"], ["Cardamom"], ["Oil Palm"]); null if any/none.
- landSizeClass: subset of ["marginal","small","semi-medium","medium","large"] only if the scheme restricts or prefers by land-holding size; else null.
- communities: subset of ["SC","ST","Tribal","BC","MBC","DNC","Minority","General"]; null if open to all.
- communityIsPreferenceOnly: true when communities are a stated PREFERENCE / reservation flow (e.g. "preference to", "X% flow to SC/ST") rather than a hard requirement.
- gender: "female" if women-only, "male" if men-only, else null.
- ageMin / ageMax: numbers if an age bound is stated, else null.
- incomeMaxAnnual: rupees-per-year income cap if stated (use the rural figure if both rural and urban are given), else null.
- otherConditions: short phrases for any other hard requirement that doesn't fit above (e.g. "must produce and supply certified seeds", "must be part of a 15-farmer group", "subsidy claim within 6 months of purchase").

Return ONLY JSON of the form: {"schemes":[{"slug":"<slug>","criteria":{...}}, ...]} covering every scheme given, in order.`;

async function llmBatch(client, batch) {
  const user = batch.map((r, i) => [
    `## Scheme ${i + 1}`,
    `slug: ${r.slug}`,
    `name: ${r.name}`,
    `level: ${r.level}`,
    `category: ${r.category}`,
    r.brief ? `brief: ${r.brief}` : '',
    `eligibility:\n${r.eligibility || '(not specified)'}`,
    r.exclusions ? `exclusions:\n${r.exclusions}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');

  const res = await client.chat.completions.create({
    model: CHAT_MODEL,
    max_completion_tokens: 4096,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
  });
  const raw = res.choices[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(raw);
  return parsed.schemes || [];
}

function normalizeCriteria(c, rec) {
  const safe = c || {};
  const arr = (v) => (Array.isArray(v) && v.length ? v : null);
  return {
    level: rec.level === 'Central' ? 'Central' : 'State',
    occupations: Array.isArray(safe.occupations) ? safe.occupations : [],
    districts: arr(safe.districts),
    crops: arr(safe.crops),
    landSizeClass: arr(safe.landSizeClass),
    communities: arr(safe.communities),
    communityIsPreferenceOnly: !!safe.communityIsPreferenceOnly,
    gender: safe.gender === 'female' || safe.gender === 'male' ? safe.gender : null,
    ageMin: Number.isFinite(safe.ageMin) ? safe.ageMin : null,
    ageMax: Number.isFinite(safe.ageMax) ? safe.ageMax : null,
    incomeMaxAnnual: Number.isFinite(safe.incomeMaxAnnual) ? safe.incomeMaxAnnual : null,
    otherConditions: Array.isArray(safe.otherConditions) ? safe.otherConditions.filter(Boolean) : [],
  };
}

// ---- main ------------------------------------------------------------------

async function main() {
  let records;
  if (existsSync(RAW_IN)) {
    records = JSON.parse(readFileSync(RAW_IN, 'utf8'));
    console.error(`› Source: ${RAW_IN} (${records.length} records)`);
  } else if (existsSync(MD_IN)) {
    records = parseMarkdown(readFileSync(MD_IN, 'utf8'));
    console.error(`› Source: ${MD_IN} parsed (${records.length} records)`);
  } else {
    console.error(`✗ No input found. Run the crawler first or keep ${MD_IN}.`);
    process.exit(1);
  }

  const criteriaBySlug = new Map();
  let usedLLM = false;

  if (OPENAI_KEY) {
    try {
      const { default: OpenAI } = await import('openai');
      const client = new OpenAI({ apiKey: OPENAI_KEY });
      const BATCH = 8;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        process.stderr.write(`  LLM batch ${i / BATCH + 1} (${batch.length}) … `);
        try {
          const out = await llmBatch(client, batch);
          for (const o of out) if (o?.slug) criteriaBySlug.set(o.slug, o.criteria);
          usedLLM = true;
          console.error('ok');
        } catch (e) {
          console.error('ERR ' + (e?.message || e));
        }
      }
    } catch (e) {
      console.error('  OpenAI unavailable, using heuristic:', e?.message || e);
    }
  } else {
    console.error('  No OPENAI_API_KEY — using heuristic extraction.');
  }

  let llmCount = 0, heurCount = 0;
  const schemes = records.map((rec) => {
    const fromLLM = criteriaBySlug.get(rec.slug);
    let criteria;
    if (fromLLM) { criteria = normalizeCriteria(fromLLM, rec); llmCount++; }
    else { criteria = heuristicCriteria(rec); heurCount++; }
    return {
      id: rec.slug,
      slug: rec.slug,
      name: rec.name,
      shortTitle: rec.short || undefined,
      level: rec.level === 'Central' ? 'Central' : 'State',
      state: rec.state || (rec.level === 'Central' ? '' : 'Tamil Nadu'),
      department: rec.department || undefined,
      category: rec.category || undefined,
      subCategory: rec.subCategory || undefined,
      brief: rec.brief || undefined,
      benefits: rec.benefits || '',
      eligibility: rec.eligibility || '',
      exclusions: rec.exclusions || undefined,
      process: rec.process || [],
      documents: rec.documents || undefined,
      references: rec.references || [],
      criteria,
    };
  });

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(schemes, null, 2), 'utf8');
  console.error(`\n✓ Wrote ${OUT} — ${schemes.length} schemes (criteria: ${llmCount} via LLM${usedLLM ? '' : ' [none]'}, ${heurCount} heuristic)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
