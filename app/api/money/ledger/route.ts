import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { listEntries, createEntry, deleteEntry, updateEntry } from '@/lib/money/ledger';
import { EXPENSE_CATEGORIES } from '@/lib/money/types';
import type { EntryType, ExpenseCategory } from '@/lib/money/types';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const ExpenseSchema = z.object({
  type: z.literal('expense'),
  amount: z.number().nonnegative(),
  category: z.enum(EXPENSE_CATEGORIES as [ExpenseCategory, ...ExpenseCategory[]]).default('other'),
  crop: z.string().optional(),
  occurred_at: z.string().optional(),
  note: z.string().optional(),
});
const SaleSchema = z.object({
  type: z.literal('sale'),
  crop: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.enum(['quintal', 'kg']).default('quintal'),
  price_per_unit: z.number().nonnegative(),
  amount: z.number().optional(),
  buyer: z.string().optional(),
  market_modal_at_sale: z.number().optional(),
  occurred_at: z.string().optional(),
  note: z.string().optional(),
});
const LoanSchema = z.object({
  type: z.literal('loan'),
  amount: z.number().nonnegative(),
  lender: z.string().min(1),
  interest_rate: z.number().optional(),
  purpose: z.string().optional(),
  due_date: z.string().optional(),
  occurred_at: z.string().optional(),
  note: z.string().optional(),
});
const CreateSchema = z.discriminatedUnion('type', [ExpenseSchema, SaleSchema, LoanSchema]);

const PatchSchema = z.object({
  entryId: z.string().min(1),
  patch: z.record(z.unknown()),
});

/** GET /api/money/ledger?type=expense|sale|loan — list the farmer's entries. */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const entries = await listEntries(farmer.farmerId);
  const typeFilter = req.nextUrl.searchParams.get('type') as EntryType | null;
  const filtered = typeFilter ? entries.filter((e) => e.type === typeFilter) : entries;
  return NextResponse.json({ entries: filtered });
}

/** POST /api/money/ledger — create an expense / sale / loan entry. */
export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const input = CreateSchema.parse(await req.json());
    const entry = await createEntry(farmer.farmerId, input);
    return NextResponse.json({ success: true, entry });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Ledger create failed:', err);
    return NextResponse.json({ error: 'Failed to save entry' }, { status: 500 });
  }
}

/** PATCH /api/money/ledger — edit fields on an entry. */
export async function PATCH(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { entryId, patch } = PatchSchema.parse(await req.json());
    await updateEntry(farmer.farmerId, entryId, patch);
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Ledger update failed:', err);
    return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
  }
}

/** DELETE /api/money/ledger?entryId=... — remove an entry. */
export async function DELETE(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const entryId = req.nextUrl.searchParams.get('entryId');
  if (!entryId) return NextResponse.json({ error: 'entryId is required' }, { status: 400 });
  await deleteEntry(farmer.farmerId, entryId);
  return NextResponse.json({ success: true });
}
