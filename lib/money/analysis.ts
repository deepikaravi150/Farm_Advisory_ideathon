/**
 * Financial analysis over a farmer's ledger: profit/loss, expense breakdown,
 * per-crop P&L, an above/below-market "scam" check on sales, and loan-vs-spend.
 * Deterministic first; then a short localized AI narrative that always falls back
 * to computed strings so the Money tab never breaks.
 */
import { chatWithBedrock } from '@/lib/ai/openai';
import type {
  FinancialEntry, SaleEntry, ExpenseEntry, LoanEntry,
  FinancialAnalysis, CategoryTotal, CropPnl, SaleComparison, FinancialNarrative,
} from './types';

type Locale = 'en' | 'hi' | 'ta';
const rupee = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const languageName = (l: Locale) => (l === 'ta' ? 'Tamil' : l === 'hi' ? 'Hindi' : 'English');

/** A sale's price/quantity normalized to ₹ per quintal. */
function toQuintal(s: SaleEntry): { pricePerQtl: number; qtl: number } {
  if (s.unit === 'kg') return { pricePerQtl: (Number(s.price_per_unit) || 0) * 100, qtl: (Number(s.quantity) || 0) / 100 };
  return { pricePerQtl: Number(s.price_per_unit) || 0, qtl: Number(s.quantity) || 0 };
}

export function computeDeterministic(
  entries: FinancialEntry[],
): Omit<FinancialAnalysis, 'narrative'> {
  const expenses = entries.filter((e): e is ExpenseEntry => e.type === 'expense');
  const sales = entries.filter((e): e is SaleEntry => e.type === 'sale');
  const loans = entries.filter((e): e is LoanEntry => e.type === 'loan');

  const totalExpenses = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalRevenue = sales.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const totalLoans = loans.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  // Expense by category.
  const catMap = new Map<string, number>();
  for (const e of expenses) catMap.set(e.category, (catMap.get(e.category) ?? 0) + (Number(e.amount) || 0));
  const expensesByCategory: CategoryTotal[] = [...catMap.entries()]
    .map(([category, amount]) => ({ category: category as CategoryTotal['category'], amount }))
    .sort((a, b) => b.amount - a.amount);

  // Per-crop P&L.
  const cropMap = new Map<string, { spent: number; earned: number }>();
  const touch = (c: string) => { const k = c.trim() || 'unspecified'; if (!cropMap.has(k)) cropMap.set(k, { spent: 0, earned: 0 }); return cropMap.get(k)!; };
  for (const e of expenses) if (e.crop) touch(e.crop).spent += Number(e.amount) || 0;
  for (const s of sales) touch(s.crop).earned += Number(s.amount) || 0;
  const perCrop: CropPnl[] = [...cropMap.entries()]
    .map(([crop, v]) => ({ crop, spent: v.spent, earned: v.earned, profit: v.earned - v.spent }))
    .sort((a, b) => b.earned - a.earned);

  // Sale vs market comparison.
  const saleComparisons: SaleComparison[] = sales.map((s) => {
    const { pricePerQtl, qtl } = toQuintal(s);
    const market = s.market_modal_at_sale != null ? Number(s.market_modal_at_sale) : null;
    let status: SaleComparison['status'] = 'unknown';
    let deltaPerQtl = 0;
    let lossIfBelow = 0;
    if (market && market > 0) {
      deltaPerQtl = Math.round(pricePerQtl - market);
      status = pricePerQtl >= market * 1.02 ? 'above' : pricePerQtl <= market * 0.98 ? 'below' : 'at';
      if (status === 'below') lossIfBelow = Math.round((market - pricePerQtl) * qtl);
    }
    return {
      entryId: s.entry_id, crop: s.crop, occurredAt: s.occurred_at,
      pricePerQtl: Math.round(pricePerQtl), marketModal: market, status, deltaPerQtl, qtl,
      lossIfBelow, ...(s.buyer ? { buyer: s.buyer } : {}),
    };
  });
  const belowSales = saleComparisons.filter((c) => c.status === 'below');
  const underMarketCount = belowSales.length;
  const estimatedLossFromUnderselling = belowSales.reduce((s, c) => s + c.lossIfBelow, 0);

  // Buyers linked to 2+ below-market sales.
  const buyerBelow = new Map<string, number>();
  for (const c of belowSales) if (c.buyer) buyerBelow.set(c.buyer, (buyerBelow.get(c.buyer) ?? 0) + 1);
  const suspiciousBuyers = [...buyerBelow.entries()].filter(([, n]) => n >= 2).map(([b]) => b);

  const overBudget = totalLoans > 0 && totalExpenses > totalLoans;
  const loanSummary = {
    totalLoans, totalExpenses, overBudget,
    remaining: totalLoans - totalExpenses,
    utilizationPct: totalLoans > 0 ? Math.round((totalExpenses / totalLoans) * 100) : 0,
    loans,
  };

  return {
    currency: 'INR',
    totalExpenses, totalRevenue, netProfit: totalRevenue - totalExpenses,
    expensesByCategory, perCrop, saleComparisons,
    underMarketCount, estimatedLossFromUnderselling, suspiciousBuyers,
    loanSummary,
    counts: { expenses: expenses.length, sales: sales.length, loans: loans.length },
  };
}

const CATEGORY_LABEL: Record<string, string> = {
  seeds: 'seeds', fertilizer: 'fertilizer', pesticide: 'pesticide', labour: 'labour',
  irrigation: 'irrigation', machinery: 'machinery', transport: 'transport', land_rent: 'land rent', other: 'other',
};

/** Deterministic English narrative used as the fallback (and base for the LLM). */
export function fallbackNarrative(a: Omit<FinancialAnalysis, 'narrative'>): FinancialNarrative {
  const net = a.netProfit;
  const healthSummary = a.counts.expenses + a.counts.sales === 0
    ? 'Start logging your expenses and sales to see your profit or loss.'
    : `So far you've spent ${rupee(a.totalExpenses)} and earned ${rupee(a.totalRevenue)} — ${net >= 0 ? `a profit of ${rupee(net)}` : `a loss of ${rupee(-net)}`}.`;
  const top = a.expensesByCategory[0];
  const topSpendArea = top
    ? `Your biggest expense is ${CATEGORY_LABEL[top.category] ?? top.category} at ${rupee(top.amount)}.`
    : 'No expenses logged yet.';
  const sellingAdvice = a.underMarketCount > 0
    ? `${a.underMarketCount} sale(s) were below the market rate — about ${rupee(a.estimatedLossFromUnderselling)} less than the going price. Check rates before you sell${a.suspiciousBuyers.length ? ` and be careful with: ${a.suspiciousBuyers.join(', ')}` : ''}.`
    : 'Your sales are at or above the market rate — good.';
  const loanWarning = a.loanSummary.overBudget
    ? `Your spending (${rupee(a.loanSummary.totalExpenses)}) has crossed your total loans (${rupee(a.loanSummary.totalLoans)}). Watch your budget.`
    : a.loanSummary.totalLoans > 0
      ? `You've used ${a.loanSummary.utilizationPct}% of your loan money so far.`
      : 'No loans recorded.';
  return { healthSummary, topSpendArea, sellingAdvice, loanWarning };
}

/** Full analysis with a localized AI narrative (falls back to computed strings). */
export async function computeAnalysis(
  entries: FinancialEntry[],
  opts: { locale?: Locale } = {},
): Promise<FinancialAnalysis> {
  const base = computeDeterministic(entries);
  const fallback = fallbackNarrative(base);
  const locale = opts.locale ?? 'en';

  // Nothing logged, or English → skip the LLM.
  if (base.counts.expenses + base.counts.sales + base.counts.loans === 0) {
    return { ...base, narrative: fallback };
  }

  let narrative = fallback;
  try {
    const raw = await chatWithBedrock(
      [{
        role: 'user',
        content: `A Tamil Nadu farmer's finances so far:
- Total spent: ₹${base.totalExpenses}
- Total earned from sales: ₹${base.totalRevenue}
- Net: ₹${base.netProfit} (${base.netProfit >= 0 ? 'profit' : 'loss'})
- Top expense: ${base.expensesByCategory[0] ? `${base.expensesByCategory[0].category} ₹${base.expensesByCategory[0].amount}` : 'none'}
- Sales below market: ${base.underMarketCount} (approx ₹${base.estimatedLossFromUnderselling} lost)${base.suspiciousBuyers.length ? `; repeatedly underpaying buyers: ${base.suspiciousBuyers.join(', ')}` : ''}
- Total loans: ₹${base.loanSummary.totalLoans}; spending is ${base.loanSummary.overBudget ? 'ABOVE' : 'within'} total loans (${base.loanSummary.utilizationPct}% used)

Return ONLY JSON with short, plain, farmer-friendly sentences:
{
  "healthSummary": "one line on profit/loss and overall health",
  "topSpendArea": "one line on where most money goes and any saving tip",
  "sellingAdvice": "one line on selling vs market price / scam risk",
  "loanWarning": "one line on loan usage / over-budget"
}
Write all values in ${languageName(locale)}. Keep ₹ figures as digits. Return only valid JSON.`,
      }],
      'You are FarmAdvisor, a Tamil Nadu farm economics helper. Be concise, practical, and honest. Return only valid JSON.',
      { json: true, maxTokens: 400 },
    );
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      narrative = {
        healthSummary: String(p.healthSummary || fallback.healthSummary),
        topSpendArea: String(p.topSpendArea || fallback.topSpendArea),
        sellingAdvice: String(p.sellingAdvice || fallback.sellingAdvice),
        loanWarning: String(p.loanWarning || fallback.loanWarning),
      };
    }
  } catch (err) {
    console.error('Financial narrative generation failed:', err);
  }

  return { ...base, narrative };
}

/**
 * Compact, prompt-ready summary of a farmer's recorded finances for the chat
 * engine (web + WhatsApp), so it can answer money questions from real figures.
 */
export function buildFinancialPromptContext(entries: FinancialEntry[]): string {
  if (!entries.length) return '';
  const a = computeDeterministic(entries);
  const inr = (n: number) => n.toLocaleString('en-IN');
  const lines = [
    `- Total spent: ₹${inr(a.totalExpenses)}; total earned: ₹${inr(a.totalRevenue)}; net ${a.netProfit >= 0 ? 'profit' : 'loss'}: ₹${inr(Math.abs(a.netProfit))}`,
  ];
  if (a.expensesByCategory.length) lines.push(`- Top expenses: ${a.expensesByCategory.slice(0, 3).map((c) => `${c.category} ₹${inr(c.amount)}`).join(', ')}`);
  if (a.underMarketCount > 0) lines.push(`- ${a.underMarketCount} sale(s) below market (~₹${inr(a.estimatedLossFromUnderselling)} lost)${a.suspiciousBuyers.length ? `; watch buyers: ${a.suspiciousBuyers.join(', ')}` : ''}`);
  if (a.loanSummary.totalLoans > 0) lines.push(`- Loans: ₹${inr(a.loanSummary.totalLoans)}; spending ${a.loanSummary.overBudget ? 'ABOVE' : 'within'} loans (${a.loanSummary.utilizationPct}% used)`);
  return lines.join('\n');
}
