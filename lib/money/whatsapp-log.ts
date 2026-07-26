/**
 * Parse a farmer's WhatsApp/voice message into a ledger entry draft.
 *
 * A cheap keyword gate (`looksFinancial`) avoids an LLM call on every message;
 * only likely money-logs go to `parseFinancialMessage`, which extracts structured
 * fields. Questions ("how much did I spend?") return null and fall through to chat.
 */
import { chatWithBedrock } from '@/lib/ai/openai';
import { EXPENSE_CATEGORIES, type EntryInput, type ExpenseCategory, type SaleUnit } from './types';

type Locale = 'en' | 'hi' | 'ta';

// Money verbs / nouns across en, ta, hi. A logging message also contains a number.
const KEYWORDS = /\b(spent|paid|bought|buy|cost|expense|sold|sell|sale|loan|borrow(?:ed)?|rupees?|rs\.?|inr)\b|₹|செலவ|வாங்|விற்|கடன்|ரூபா|खर्च|खरीद|बेच|कर्ज|लोन|रुपय|रुपये/i;

/** Fast pre-filter: a digit AND a money keyword. */
export function looksFinancial(text: string): boolean {
  const t = String(text ?? '');
  return /\d/.test(t) && KEYWORDS.test(t);
}

interface Parsed {
  type: 'expense' | 'sale' | 'loan' | 'none';
  amount?: number;
  category?: string;
  crop?: string;
  quantity?: number;
  unit?: string;
  price_per_unit?: number;
  lender?: string;
}

/** Extract a ledger draft, or null if it isn't a clear log statement. */
export async function parseFinancialMessage(text: string, locale: Locale = 'en'): Promise<EntryInput | null> {
  let parsed: Parsed;
  try {
    const raw = await chatWithBedrock(
      [{
        role: 'user',
        content: `A farmer sent this message (language may be English, Tamil, or Hindi). If it RECORDS money spent, a crop sold, or a loan taken, extract it. If it's a question or not a money record, use type "none".

Message: "${text}"

Return ONLY JSON:
{
  "type": "expense" | "sale" | "loan" | "none",
  "amount": number | null,          // total rupees (for a loan, the principal)
  "category": one of ${JSON.stringify(EXPENSE_CATEGORIES)} | null,  // for expense
  "crop": string | null,            // English crop name for expense/sale
  "quantity": number | null,        // for sale
  "unit": "quintal" | "kg" | null,  // for sale
  "price_per_unit": number | null,  // for sale, ₹ per unit
  "lender": string | null           // for loan (bank/person)
}
Rules: numbers as plain digits; infer category from context (urea/DAP→fertilizer, wages→labour, etc.); if unsure of unit assume quintal. Return only valid JSON.`,
      }],
      'You extract structured farm financial records from short messages. Return only valid JSON.',
      { json: true, maxTokens: 200 },
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    parsed = JSON.parse(match[0]) as Parsed;
  } catch (err) {
    console.error('parseFinancialMessage failed:', err);
    return null;
  }

  if (!parsed || parsed.type === 'none') return null;

  const amount = Number(parsed.amount) || 0;
  if (parsed.type === 'expense') {
    if (amount <= 0) return null;
    const category = (EXPENSE_CATEGORIES as string[]).includes(String(parsed.category)) ? (parsed.category as ExpenseCategory) : 'other';
    return { type: 'expense', amount, category, crop: parsed.crop || undefined, note: text };
  }
  if (parsed.type === 'sale') {
    const quantity = Number(parsed.quantity) || 0;
    const price = Number(parsed.price_per_unit) || 0;
    if (quantity <= 0 || price <= 0) return null;
    const unit: SaleUnit = parsed.unit === 'kg' ? 'kg' : 'quintal';
    return { type: 'sale', crop: parsed.crop || 'crop', quantity, unit, price_per_unit: price, note: text };
  }
  if (parsed.type === 'loan') {
    if (amount <= 0) return null;
    return { type: 'loan', amount, lender: parsed.lender || 'Lender', note: text };
  }
  return null;
}
