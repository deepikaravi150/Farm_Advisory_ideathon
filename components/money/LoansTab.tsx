'use client';
import { useState } from 'react';
import { Plus, Trash2, Landmark, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FinancialEntry, LoanEntry, FinancialAnalysis } from '@/lib/money/types';
import { rupee, today, inputCls, Field, createLedgerEntry, deleteLedgerEntry } from './shared';

export default function LoansTab({
  entries, analysis, reload,
}: { entries: FinancialEntry[]; analysis: FinancialAnalysis | null; reload: () => void }) {
  const t = useTranslations('money');
  const [open, setOpen] = useState(false);
  const [lender, setLender] = useState('');
  const [amount, setAmount] = useState('');
  const [interest, setInterest] = useState('');
  const [purpose, setPurpose] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const loans = entries.filter((e): e is LoanEntry => e.type === 'loan');
  const ls = analysis?.loanSummary;
  const pct = ls ? Math.min(100, ls.utilizationPct) : 0;

  async function submit() {
    const amt = Number(amount);
    if (!lender || !amt) return;
    setSaving(true);
    const ok = await createLedgerEntry({
      type: 'loan', lender, amount: amt,
      interest_rate: interest ? Number(interest) : undefined,
      purpose: purpose || undefined, due_date: dueDate || undefined,
    });
    setSaving(false);
    if (ok) { setLender(''); setAmount(''); setInterest(''); setPurpose(''); setDueDate(''); setOpen(false); reload(); }
  }
  async function remove(id: string) { if (await deleteLedgerEntry(id)) reload(); }

  return (
    <div className="space-y-4">
      {ls && ls.totalLoans > 0 && (
        <section className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-gray-800">{t('spentVsLoans')}</span>
            <span className="text-gray-600">{rupee(ls.totalExpenses)} / {rupee(ls.totalLoans)}</span>
          </div>
          <div className="mt-2 h-2.5 w-full rounded-full bg-slate-100">
            <div className={`h-2.5 rounded-full ${ls.overBudget ? 'bg-red-500' : 'bg-brand-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className={`mt-2 text-xs ${ls.overBudget ? 'text-red-600' : 'text-gray-500'}`}>{t('loanUtil', { pct: ls.utilizationPct })}</p>
          {ls.overBudget && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span><strong>{t('overBudgetTitle')}</strong><br />{t('overBudgetDesc', { spent: rupee(ls.totalExpenses), loans: rupee(ls.totalLoans) })}</span>
            </div>
          )}
        </section>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Plus className="h-4 w-4" /> {t('addLoan')}
        </button>
      ) : (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          <Field label={t('lender')}><input value={lender} onChange={(e) => setLender(e.target.value)} className={inputCls} /></Field>
          <Field label={t('principal')}><input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls} /></Field>
          <Field label={t('interest')}><input type="number" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} className={inputCls} /></Field>
          <Field label={t('purpose')}><input value={purpose} onChange={(e) => setPurpose(e.target.value)} className={inputCls} /></Field>
          <Field label={t('dueDate')}><input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={inputCls} /></Field>
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !lender || !amount} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t('save')}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600">{t('cancel')}</button>
          </div>
        </section>
      )}

      <ul className="space-y-2">
        {loans.length === 0 && (
          <li className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">{t('noEntries')}</li>
        )}
        {loans.map((l) => (
          <li key={l.entry_id} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-sm">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 truncate text-sm font-medium text-gray-800"><Landmark className="h-3.5 w-3.5 text-brand-600" />{l.lender}{l.interest_rate ? ` · ${l.interest_rate}%` : ''}</p>
              <p className="text-xs text-gray-400">{l.purpose || ''}{l.due_date ? `${l.purpose ? ' · ' : ''}${t('due')}: ${l.due_date}` : ''}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-semibold text-gray-900">{rupee(l.amount)}</span>
              <button onClick={() => remove(l.entry_id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
