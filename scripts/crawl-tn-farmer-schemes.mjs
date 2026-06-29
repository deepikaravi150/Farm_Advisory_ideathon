/**
 * crawl-tn-farmer-schemes.mjs
 * ---------------------------------------------------------------------------
 * Crawls myScheme (https://www.myscheme.gov.in) and builds a single Markdown
 * reference of government schemes relevant to FARMERS in Tamil Nadu, covering
 * both State and Central schemes.
 *
 * Source of truth = the public myScheme API used by the website itself:
 *   - Search : GET /search/v6/schemes
 *   - Detail : GET /schemes/v6/public/schemes?slug=<slug>&lang=en
 *   - Docs   : GET /schemes/v6/public/schemes/<_id>/documents?lang=en
 *
 * Scheme set = union of, for Tamil Nadu:
 *     occupation = Farmer | occupation = Fishermen
 *     schemeCategory = "Agriculture,Rural & Environment"
 *     keyword "farmer"
 *   PLUS Central (nationwide) schemes with occupation = Farmer
 *
 * For every scheme we extract: benefit (with amounts), eligibility criteria,
 * application process (per mode) and documents required.
 *
 * Run:  node scripts/crawl-tn-farmer-schemes.mjs
 * Out:  tamil-nadu-farmer-schemes.md  (repo root, override with argv[2])
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const API = 'https://api.myscheme.gov.in';
const KEY = 'tYTy5eEhlu9rFjyxuCr7ra7ACp4dv1RH8gWuHTDc'; // public key shipped in the site bundle
const HEADERS = {
  'x-api-key': KEY,
  'User-Agent': 'Mozilla/5.0',
  Origin: 'https://www.myscheme.gov.in',
  Referer: 'https://www.myscheme.gov.in/',
  Accept: 'application/json',
};
const OUT = process.argv[2] || 'tamil-nadu-farmer-schemes.md';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS });
      if (r.ok) return await r.json();
      if (r.status === 429 || r.status >= 500) { await sleep(800 * (i + 1)); continue; }
      throw new Error(`HTTP ${r.status} for ${url}`);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(800 * (i + 1));
    }
  }
}

async function search(filters, keyword = '') {
  const q = encodeURIComponent(JSON.stringify(filters));
  const url = `${API}/search/v6/schemes?lang=en&q=${q}&keyword=${encodeURIComponent(keyword)}&sort=&from=0&size=100`;
  const j = await getJSON(url);
  return (j.data?.hits?.items || []).map((x) => x.fields);
}

// ---- markdown / rich-text cleaning -----------------------------------------

// myScheme content is frequently double/triple HTML-encoded (e.g. "&amp;amp;lt;"),
// so decode named + numeric entities repeatedly until the string is stable.
function decodeEntities(s) {
  const named = {
    '&lt;': '<', '&gt;': '>', '&amp;': '&', '&nbsp;': ' ', '&quot;': '"',
    '&rsquo;': "'", '&lsquo;': "'", '&ldquo;': '"', '&rdquo;': '"',
    '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  };
  for (let i = 0; i < 6; i++) {
    const next = s
      .replace(/&(?:lt|gt|amp|nbsp|quot|rsquo|lsquo|ldquo|rdquo|ndash|mdash|hellip);/g, (m) => named[m])
      .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n));
    if (next === s) break;
    s = next;
  }
  return s;
}

function cleanMd(s) {
  if (!s) return '';
  s = decodeEntities(String(s));
  s = s.replace(/<br\s*\/?>/gi, '\n');                 // <br> -> newline
  s = s.replace(/\*{4,}/g, '** · **');                 // separate concatenated bold table cells
  s = s.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');
  s = s.replace(/\n{3,}/g, '\n\n').trim();
  return s;
}

// Slate-like node tree -> markdown (used for documents_required which has no _md)
function inline(children) {
  return (children || [])
    .map((c) => (c.text !== undefined ? (c.bold ? `**${c.text}**` : c.text) : inline(c.children)))
    .join('');
}
function blockToMd(node, depth = 0) {
  const t = node.type;
  if (t === 'ul_list' || t === 'ol_list') {
    const ordered = t === 'ol_list';
    const items = (node.children || []).filter((c) => c.type === 'list_item'); // skip stray empty paragraphs
    return items
      .map((li, idx) => {
        let txt = '';
        const nested = [];
        for (const ch of li.children || []) {
          if (ch.type === 'ul_list' || ch.type === 'ol_list') nested.push(blockToMd(ch, depth + 1));
          else if (ch.text !== undefined) txt += ch.bold ? `**${ch.text}**` : ch.text;
          else txt += inline(ch.children);
        }
        const bullet = ordered ? `${idx + 1}.` : '-';
        let line = `${'  '.repeat(depth)}${bullet} ${txt.trim()}`;
        if (nested.length) line += '\n' + nested.join('\n');
        return line;
      })
      .filter((l) => l.replace(/^[\s\d.-]+/, '').trim()) // drop empty list items
      .join('\n');
  }
  if (t === 'paragraph') return inline(node.children);
  if (t && t.startsWith('align')) return (node.children || []).map((c) => blockToMd(c, depth)).join('\n');
  if (node.children) return node.children.map((c) => blockToMd(c, depth)).join('\n');
  if (node.text !== undefined) return node.bold ? `**${node.text}**` : node.text;
  return '';
}
function nodesToMd(nodes) {
  return cleanMd((nodes || []).map((n) => blockToMd(n, 0)).join('\n'));
}

// ---- collect the scheme set ------------------------------------------------

async function collectSlugs() {
  const TN = (extra) => [{ identifier: 'beneficiaryState', value: 'Tamil Nadu' }, ...extra];
  const sets = await Promise.all([
    search(TN([{ identifier: 'occupation', value: 'Farmer' }])),
    search(TN([{ identifier: 'occupation', value: 'Fishermen' }])),
    search(TN([{ identifier: 'schemeCategory', value: 'Agriculture,Rural & Environment' }])),
    search(TN([]), 'farmer'),
    search([{ identifier: 'occupation', value: 'Farmer' }, { identifier: 'level', value: 'Central' }]),
  ]);
  const bySlug = new Map();
  for (const items of sets) {
    for (const f of items) {
      if (!bySlug.has(f.slug)) {
        bySlug.set(f.slug, {
          slug: f.slug,
          name: f.schemeName,
          short: f.schemeShortTitle || '',
          level: f.level || '',
          state: (f.beneficiaryState || []).join(', '),
          category: (f.schemeCategory || []).join(', '),
          brief: (f.briefDescription || '').trim(),
          tags: f.tags || [],
        });
      }
    }
  }
  return [...bySlug.values()];
}

async function fetchDetail(slug) {
  const j = await getJSON(`${API}/schemes/v6/public/schemes?slug=${encodeURIComponent(slug)}&lang=en`);
  const en = j.data?.en;
  const id = j.data?._id;
  if (!en) return null;
  const bd = en.basicDetails || {};
  const sc = en.schemeContent || {};

  let documents = '';
  if (id) {
    try {
      const dj = await getJSON(`${API}/schemes/v6/public/schemes/${id}/documents?lang=en`);
      documents = nodesToMd(dj.data?.en?.documents_required);
    } catch { /* documents optional */ }
  }

  const dept =
    bd.nodalMinistryName?.label ||
    bd.nodalDepartmentName?.label ||
    bd.otherMinistryName?.label ||
    (Array.isArray(bd.otherDepartmentNames) ? bd.otherDepartmentNames.map((d) => d.label).join(', ') : '') ||
    '—';

  return {
    name: bd.schemeName,
    short: bd.schemeShortTitle || '',
    level: bd.level?.label || '',
    state: bd.state?.label || '',
    category: (bd.schemeCategory || []).map((c) => c.label).join(', '),
    subCategory: (bd.schemeSubCategory || []).map((c) => c.label).join(', '),
    dept,
    brief: cleanMd(sc.briefDescription),
    // a few schemes have no structured benefits — fall back to the detailed description
    benefits: cleanMd(sc.benefits_md) || cleanMd(sc.detailedDescription_md),
    eligibility: cleanMd(en.eligibilityCriteria?.eligibilityDescription_md),
    exclusions: cleanMd(sc.exclusions_md),
    process: (en.applicationProcess || []).map((p) => ({ mode: p.mode, md: cleanMd(p.process_md) })),
    documents,
    references: sc.references || [],
  };
}

// ---- build the markdown ----------------------------------------------------

// Append the short title only when the scheme name doesn't already contain it.
function displayTitle(s) {
  if (s.short && !s.name.toUpperCase().includes(s.short.toUpperCase())) return `${s.name} (${s.short})`;
  return s.name;
}
const headingText = (idx, s) => `${idx}. ${displayTitle(s)}`;
// Replicate GitHub's heading-anchor algorithm so the TOC links resolve.
function githubAnchor(text) {
  return text.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
}
// myScheme reference URLs sometimes contain spaces/parens; wrap those so Markdown links don't break.
const fmtUrl = (u) => {
  u = String(u || '').trim();
  return /[ ()]/.test(u) ? `<${u}>` : u;
};

function schemeBlock(idx, s, slug) {
  const url = `https://www.myscheme.gov.in/schemes/${slug}`;
  const out = [];
  out.push(`### ${headingText(idx, s)}`);
  const meta = [
    `**Level:** ${s.level || '—'}`,
    `**Dept/Ministry:** ${s.dept || '—'}`,
    s.category ? `**Category:** ${s.category}` : '',
    s.subCategory ? `**Sub-category:** ${s.subCategory}` : '',
  ].filter(Boolean);
  out.push(meta.join('  ·  '));
  if (s.brief) out.push(`\n${s.brief}`);

  out.push(`\n**💰 Benefits**\n`);
  out.push(s.benefits || '_Not specified._');

  out.push(`\n**✅ Eligibility**\n`);
  out.push(s.eligibility || '_Not specified._');

  if (s.exclusions) {
    out.push(`\n**🚫 Exclusions**\n`);
    out.push(s.exclusions);
  }

  out.push(`\n**📝 How to Apply**\n`);
  if (s.process.length) {
    for (const p of s.process) {
      out.push(`_Mode: ${p.mode || 'N/A'}_\n`);
      out.push(p.md || '_Not specified._');
    }
  } else {
    out.push('_Not specified._');
  }

  if (s.documents) {
    out.push(`\n**📄 Documents Required**\n`);
    out.push(s.documents);
  }

  const links = [`[View on myScheme](${url})`, ...s.references.map((r) => `[${(r.title || 'Reference').trim()}](${fmtUrl(r.url)})`)];
  out.push(`\n**🔗 Source:** ${links.join(' · ')}`);
  out.push('\n---\n');
  return out.join('\n');
}

async function main() {
  console.error('› Collecting scheme list …');
  const list = await collectSlugs();
  console.error(`  found ${list.length} unique farmer-relevant schemes`);

  const details = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    process.stderr.write(`  [${i + 1}/${list.length}] ${s.slug} … `);
    try {
      const d = await fetchDetail(s.slug);
      if (d) {
        details.push({ ...d, slug: s.slug, _listLevel: s.level });
        console.error('ok');
      } else {
        console.error('no detail');
      }
    } catch (e) {
      console.error('ERR ' + e.message);
    }
    await sleep(120);
  }

  // group: Central first, then Tamil Nadu State; alpha within group
  const central = details.filter((d) => /central/i.test(d.level || d._listLevel)).sort((a, b) => a.name.localeCompare(b.name));
  const state = details.filter((d) => !/central/i.test(d.level || d._listLevel)).sort((a, b) => a.name.localeCompare(b.name));

  const today = new Date().toISOString().slice(0, 10);
  const md = [];
  md.push('# Tamil Nadu Farmer Schemes — State & Central');
  md.push('');
  md.push('> A consolidated reference of government schemes available to **farmers in Tamil Nadu**, covering Tamil Nadu state schemes and nationwide Central schemes. Each entry lists the **benefit (with amounts)**, **eligibility criteria**, **how to apply**, and **documents required**.');
  md.push('');
  md.push(`**Source:** [myScheme — Government of India](https://www.myscheme.gov.in/search/state/Tamil%20Nadu) (official scheme aggregator)  `);
  md.push(`**Generated:** ${today} · **Total schemes:** ${details.length} (${state.length} Tamil Nadu state · ${central.length} Central)  `);
  md.push('**Regenerate:** `node scripts/crawl-tn-farmer-schemes.mjs`');
  md.push('');
  md.push('> ⚠️ Scheme rules, benefit amounts and deadlines change. Always confirm on the official myScheme/department page (linked under each scheme) before applying.');
  md.push('');

  // Table of contents
  md.push('## Contents');
  md.push('');
  md.push(`### Tamil Nadu State Schemes (${state.length})`);
  state.forEach((d, i) => md.push(`${i + 1}. [${d.name}](#${githubAnchor(headingText(i + 1, d))})`));
  md.push('');
  md.push(`### Central Government Schemes (${central.length})`);
  central.forEach((d, i) => md.push(`${i + 1}. [${d.name}](#${githubAnchor(headingText(i + 1, d))})`));
  md.push('');
  md.push('---');
  md.push('');

  md.push('## Tamil Nadu State Schemes');
  md.push('');
  state.forEach((d, i) => md.push(schemeBlock(i + 1, d, d.slug)));

  md.push('## Central Government Schemes');
  md.push('');
  central.forEach((d, i) => md.push(schemeBlock(i + 1, d, d.slug)));

  writeFileSync(OUT, md.join('\n'), 'utf8');
  console.error(`\n✓ Wrote ${OUT} — ${details.length} schemes (${state.length} state, ${central.length} central)`);

  // Also emit the structured records so downstream tooling (criteria extraction,
  // the matcher) doesn't have to re-parse the Markdown. Same data the .md is
  // built from, grouped state-first then central, with slug preserved.
  const RAW_OUT = 'lib/data/tn-schemes.raw.json';
  const raw = [...state, ...central].map((d) => ({
    slug: d.slug,
    name: d.name,
    short: d.short || '',
    level: /central/i.test(d.level || d._listLevel) ? 'Central' : 'State',
    state: d.state || '',
    department: d.dept || '',
    category: d.category || '',
    subCategory: d.subCategory || '',
    brief: d.brief || '',
    benefits: d.benefits || '',
    eligibility: d.eligibility || '',
    exclusions: d.exclusions || '',
    process: d.process || [],
    documents: d.documents || '',
    references: d.references || [],
  }));
  mkdirSync(dirname(RAW_OUT), { recursive: true });
  writeFileSync(RAW_OUT, JSON.stringify(raw, null, 2), 'utf8');
  console.error(`✓ Wrote ${RAW_OUT} — ${raw.length} structured records`);
}

main().catch((e) => { console.error(e); process.exit(1); });
