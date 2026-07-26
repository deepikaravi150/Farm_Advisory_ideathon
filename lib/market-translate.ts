import { chatWithBedrock } from './ai/openai';
import { getItem, putItem, Tables } from './aws/dynamodb';

export type MarketLocale = 'hi' | 'ta';

const LANG_NAME: Record<MarketLocale, string> = { hi: 'Hindi', ta: 'Tamil' };

function cacheKey(text: string, locale: MarketLocale) {
  return `${text.trim().toLowerCase()}#${locale}`;
}

async function fetchCached(text: string, locale: MarketLocale): Promise<string | null> {
  try {
    const item = await getItem(Tables.MARKET_I18N, { text_key: cacheKey(text, locale) });
    return typeof item?.translated === 'string' ? item.translated : null;
  } catch {
    return null;
  }
}

async function translateBatch(texts: string[], locale: MarketLocale): Promise<Record<string, string>> {
  const prompt = `Give the ${LANG_NAME[locale]} name for each of these Indian place names, agricultural market (mandi) names, or crop/commodity names. Use the commonly recognized ${LANG_NAME[locale]} spelling (transliterate place names, translate commodity names). Return a JSON object mapping each original string to its ${LANG_NAME[locale]} version, keeping the exact original strings as keys.

Input: ${JSON.stringify(texts)}

Return only the JSON object.`;
  try {
    const res = await chatWithBedrock(
      [{ role: 'user', content: prompt }],
      `You are a precise translator of Indian place and agricultural commodity names into ${LANG_NAME[locale]}. Return one valid JSON object only, mapping each input string to its translation.`,
      { json: true, maxTokens: 1500 }
    );
    let parsed: unknown;
    try {
      parsed = JSON.parse(res);
    } catch {
      const m = res.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    }
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch (err) {
    console.error('Market name translation failed:', err);
    return {};
  }
}

/**
 * Translates a set of English place/market/commodity names (as returned by the
 * data.gov.in Agmarknet API, which is English-only at the source) into the given
 * locale. Results are cached in a shared DynamoDB table (`market_i18n`) keyed by
 * text+locale, since the same district/market/commodity names repeat constantly
 * across farmers and requests — after the first farmer looks up a name, it's free
 * for everyone after that.
 */
export async function translateMarketNames(
  texts: string[],
  locale: 'en' | 'hi' | 'ta'
): Promise<Record<string, string>> {
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))];
  const map: Record<string, string> = {};
  for (const t of unique) map[t] = t;
  if (locale === 'en' || !unique.length) return map;

  const loc = locale as MarketLocale;
  const cached = await Promise.all(unique.map(async (t) => [t, await fetchCached(t, loc)] as const));
  const misses: string[] = [];
  for (const [t, hit] of cached) {
    if (hit) map[t] = hit;
    else misses.push(t);
  }

  if (misses.length) {
    const translated = await translateBatch(misses, loc);
    await Promise.all(
      Object.entries(translated).map(([original, value]) =>
        putItem(Tables.MARKET_I18N, { text_key: cacheKey(original, loc), text: original, translated: value }).catch(() => {})
      )
    );
    for (const t of misses) {
      if (translated[t]) map[t] = translated[t];
    }
  }

  return map;
}
