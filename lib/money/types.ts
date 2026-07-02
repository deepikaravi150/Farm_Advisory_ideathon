/**
 * Farmer financial-ledger types.
 *
 * One DynamoDB table `financial_entries` (PK farmer_id, SK entry_id) holds three
 * kinds of rows discriminated by `type`: expense, sale, loan. `amount` is the ₹
 * figure for each (expense: spent, sale: total revenue, loan: principal).
 */

export type EntryType = 'expense' | 'sale' | 'loan';

export type ExpenseCategory =
  | 'seeds' | 'fertilizer' | 'pesticide' | 'labour' | 'irrigation'
  | 'machinery' | 'transport' | 'land_rent' | 'other';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'seeds', 'fertilizer', 'pesticide', 'labour', 'irrigation',
  'machinery', 'transport', 'land_rent', 'other',
];

export type SaleUnit = 'quintal' | 'kg';

interface BaseEntry {
  farmer_id: string;
  entry_id: string;      // `${createdAtISO}#${rand}` — sortable, newest-first
  type: EntryType;
  amount: number;        // ₹
  occurred_at: string;   // YYYY-MM-DD (economic date)
  note?: string;
  created_at: string;
  updated_at?: string;
}

export interface ExpenseEntry extends BaseEntry {
  type: 'expense';
  category: ExpenseCategory;
  crop?: string;
}

export interface SaleEntry extends BaseEntry {
  type: 'sale';
  crop: string;
  quantity: number;
  unit: SaleUnit;
  price_per_unit: number;             // ₹ per `unit`
  buyer?: string;
  market_modal_at_sale?: number;      // ₹/quintal snapshot at sale time
}

export interface LoanEntry extends BaseEntry {
  type: 'loan';
  lender: string;
  // amount === principal
  interest_rate?: number;             // %/year
  purpose?: string;
  due_date?: string;                  // YYYY-MM-DD
}

export type FinancialEntry = ExpenseEntry | SaleEntry | LoanEntry;

/** Input accepted by createEntry (server fills id/timestamps, derives sale amount). */
export interface EntryInput {
  type: EntryType;
  amount?: number;
  occurred_at?: string;
  note?: string;
  // expense
  category?: ExpenseCategory;
  crop?: string;
  // sale
  quantity?: number;
  unit?: SaleUnit;
  price_per_unit?: number;
  buyer?: string;
  market_modal_at_sale?: number;
  // loan
  lender?: string;
  interest_rate?: number;
  purpose?: string;
  due_date?: string;
}

// --- Analysis ---------------------------------------------------------------

export interface CategoryTotal { category: ExpenseCategory; amount: number; }
export interface CropPnl { crop: string; spent: number; earned: number; profit: number; }

export type SaleStatus = 'above' | 'at' | 'below' | 'unknown';
export interface SaleComparison {
  entryId: string;
  crop: string;
  occurredAt: string;
  pricePerQtl: number;
  marketModal: number | null;
  status: SaleStatus;
  deltaPerQtl: number;    // sale − market (₹/qtl)
  qtl: number;
  lossIfBelow: number;    // (market − sale) × qtl, only when below
  buyer?: string;
}

export interface LoanSummary {
  totalLoans: number;
  totalExpenses: number;
  overBudget: boolean;
  remaining: number;      // totalLoans − totalExpenses (may be negative)
  utilizationPct: number;
  loans: LoanEntry[];
}

export interface FinancialNarrative {
  healthSummary: string;
  topSpendArea: string;
  sellingAdvice: string;
  loanWarning: string;
}

export interface FinancialAnalysis {
  currency: 'INR';
  totalExpenses: number;
  totalRevenue: number;
  netProfit: number;      // revenue − expenses
  expensesByCategory: CategoryTotal[];
  perCrop: CropPnl[];
  saleComparisons: SaleComparison[];
  underMarketCount: number;
  estimatedLossFromUnderselling: number;
  suspiciousBuyers: string[];
  loanSummary: LoanSummary;
  counts: { expenses: number; sales: number; loans: number };
  narrative: FinancialNarrative;
}
