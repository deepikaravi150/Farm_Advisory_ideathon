/**
 * Financial-ledger persistence — shared by the API routes AND the WhatsApp
 * quick-add path, so both write identical rows to `financial_entries`.
 */
import { putItem, queryItems, deleteItem, updateItem, Tables } from '@/lib/aws/dynamodb';
import type { FinancialEntry, EntryInput, ExpenseEntry, SaleEntry, LoanEntry } from './types';

const round = (n: unknown) => Math.round(Number(n) || 0);
const shortRand = () => Math.random().toString(36).slice(2, 8);

/** All ledger entries for a farmer, newest first. */
export async function listEntries(farmerId: string): Promise<FinancialEntry[]> {
  const rows = await queryItems({
    TableName: Tables.FINANCIAL_ENTRIES,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmerId },
    ScanIndexForward: false,
    Limit: 500,
  }).catch(() => []);
  return rows as unknown as FinancialEntry[];
}

/** Create one entry. Server owns entry_id/created_at and derives the sale total. */
export async function createEntry(farmerId: string, input: EntryInput): Promise<FinancialEntry> {
  const now = new Date().toISOString();
  const occurred_at = (input.occurred_at || now.slice(0, 10)).slice(0, 10);
  const base = {
    farmer_id: farmerId,
    entry_id: `${now}#${shortRand()}`,
    occurred_at,
    created_at: now,
    ...(input.note ? { note: input.note } : {}),
  };

  let item: FinancialEntry;
  if (input.type === 'sale') {
    const quantity = Number(input.quantity) || 0;
    const price_per_unit = round(input.price_per_unit);
    const amount = input.amount != null ? round(input.amount) : round(quantity * price_per_unit);
    item = {
      ...base,
      type: 'sale',
      crop: input.crop || 'crop',
      quantity,
      unit: input.unit === 'kg' ? 'kg' : 'quintal',
      price_per_unit,
      amount,
      ...(input.buyer ? { buyer: input.buyer } : {}),
      ...(input.market_modal_at_sale != null ? { market_modal_at_sale: round(input.market_modal_at_sale) } : {}),
    } as SaleEntry;
  } else if (input.type === 'loan') {
    item = {
      ...base,
      type: 'loan',
      amount: round(input.amount),
      lender: input.lender || 'Lender',
      ...(input.interest_rate != null ? { interest_rate: Number(input.interest_rate) } : {}),
      ...(input.purpose ? { purpose: input.purpose } : {}),
      ...(input.due_date ? { due_date: input.due_date.slice(0, 10) } : {}),
    } as LoanEntry;
  } else {
    item = {
      ...base,
      type: 'expense',
      amount: round(input.amount),
      category: input.category ?? 'other',
      ...(input.crop ? { crop: input.crop } : {}),
    } as ExpenseEntry;
  }

  await putItem(Tables.FINANCIAL_ENTRIES, item as unknown as Record<string, unknown>);
  return item;
}

export async function deleteEntry(farmerId: string, entryId: string): Promise<void> {
  await deleteItem(Tables.FINANCIAL_ENTRIES, { farmer_id: farmerId, entry_id: entryId });
}

/** Patch arbitrary fields on an entry (all attribute names aliased to dodge reserved words). */
export async function updateEntry(farmerId: string, entryId: string, patch: Record<string, unknown>): Promise<void> {
  const keys = Object.keys(patch).filter((k) => patch[k] !== undefined && k !== 'farmer_id' && k !== 'entry_id' && k !== 'type');
  if (!keys.length) return;
  const names: Record<string, string> = { '#u': 'updated_at' };
  const values: Record<string, unknown> = { ':u': new Date().toISOString() };
  const sets = keys.map((k, i) => { names[`#k${i}`] = k; values[`:v${i}`] = patch[k]; return `#k${i} = :v${i}`; });
  sets.push('#u = :u');
  await updateItem({
    TableName: Tables.FINANCIAL_ENTRIES,
    Key: { farmer_id: farmerId, entry_id: entryId },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  });
}

/** Quick totals for confirmations / chat context. */
export function summarize(entries: FinancialEntry[]) {
  let totalExpenses = 0, totalRevenue = 0, totalLoans = 0;
  for (const e of entries) {
    const a = Number(e.amount) || 0;
    if (e.type === 'expense') totalExpenses += a;
    else if (e.type === 'sale') totalRevenue += a;
    else if (e.type === 'loan') totalLoans += a;
  }
  return { totalExpenses, totalRevenue, totalLoans, netProfit: totalRevenue - totalExpenses };
}
