'use client';
import { useState } from 'react';
import { Plus, Trash2, Wallet, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { EXPENSE_CATEGORIES } from '@/lib/money/types';
import type { FinancialEntry, ExpenseEntry, FinancialAnalysis } from '@/lib/money/types';
import { rupee, today, inputCls, Field, createLedgerEntry, deleteLedgerEntry } from './shared';

export default function ExpensesTab({
  entries, analysis, reload,
}: { entries: FinancialEntry[]; analysis: FinancialAnalysis | null; reload: () => void }) {
  const t = useTranslations('money');
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('fertilizer');
  const [crop, setCrop] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const expenses = entries.filter((e): e is ExpenseEntry => e.type === 'expense');
  const breakdown = analysis?.expensesByCategory ?? [];
  const maxCost = breakdown.reduce((m, b) => Math.max(m, b.amount), 0);

  async function submit() {
    const amt = Number(amount);
    if (!amt) return;
    setSaving(true);
    const ok = await createLedgerEntry({ type: 'expense', amount: amt, category, crop: crop || undefined, occurred_at: date, note: note || undefined });
    setSaving(false);
    if (ok) { setAmount(''); setCrop(''); setNote(''); setOpen(false); reload(); }
  }
  async function remove(id: string) { if (await deleteLedgerEntry(id)) reload(); }

  return (
    <div className="space-y-4">
      {breakdown.length > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
            <Wallet className="h-4 w-4 text-brand-600" /> {t('whereMoneyGoes')}
          </h2>
          <ul className="space-y-2.5">
            {breakdown.map((b) => (
              <li key={b.category}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{t(`cat_${b.category}`)}</span>
                  <span className="font-medium text-gray-800">{rupee(b.amount)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full bg-brand-500" style={{ width: `${maxCost ? Math.round((b.amount / maxCost) * 100) : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm font-semibold text-gray-900">
            <span>{t('total')}</span><span>{rupee(analysis?.totalExpenses)}</span>
          </div>
        </section>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Plus className="h-4 w-4" /> {t('addExpense')}
        </button>
      ) : (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <Field label={t('category')}>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat_${c}`)}</option>)}
            </select>
          </Field>
          <Field label={t('amount')}><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label={t('cropOptional')}><input value={crop} onChange={(e) => setCrop(e.target.value)} className={inputCls} /></Field>
          <Field label={t('date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <Field label={t('note')}><input value={note} onChange={(e) => setNote(e.target.value)} className={inputCls} /></Field>
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !amount} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t('save')}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600">{t('cancel')}</button>
          </div>
        </section>
      )}

      <ul className="space-y-2">
        {expenses.length === 0 && (
          <li className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">{t('noEntries')}</li>
        )}
        {expenses.map((e) => (
          <li key={e.entry_id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-sm">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{t(`cat_${e.category}`)}{e.crop ? ` · ${e.crop}` : ''}</p>
              <p className="text-xs text-gray-400">{e.occurred_at}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900">{rupee(e.amount)}</span>
              <button onClick={() => remove(e.entry_id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
