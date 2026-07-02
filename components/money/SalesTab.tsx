'use client';
import { useState } from 'react';
import { Plus, Trash2, TrendingUp, TrendingDown, Minus, AlertTriangle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FinancialEntry, SaleEntry, FinancialAnalysis, SaleComparison } from '@/lib/money/types';
import { rupee, today, inputCls, Field, createLedgerEntry, deleteLedgerEntry } from './shared';

export default function SalesTab({
  entries, analysis, reload, marketModal, marketCrop,
}: {
  entries: FinancialEntry[]; analysis: FinancialAnalysis | null; reload: () => void;
  marketModal?: number; marketCrop?: string;
}) {
  const t = useTranslations('money');
  const [open, setOpen] = useState(false);
  const [crop, setCrop] = useState(marketCrop ?? '');
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState<'quintal' | 'kg'>('quintal');
  const [price, setPrice] = useState('');
  const [buyer, setBuyer] = useState('');
  const [date, setDate] = useState(today());
  const [saving, setSaving] = useState(false);

  const sales = entries.filter((e): e is SaleEntry => e.type === 'sale');
  const cmpById = new Map((analysis?.saleComparisons ?? []).map((c) => [c.entryId, c]));

  function snapshot(saleCrop: string): number | undefined {
    if (!marketModal || !marketCrop) return undefined;
    const a = saleCrop.trim().toLowerCase(), b = marketCrop.trim().toLowerCase();
    return a && b && (a.includes(b) || b.includes(a)) ? marketModal : undefined;
  }

  async function submit() {
    const q = Number(quantity), p = Number(price);
    if (!crop || !q || !p) return;
    setSaving(true);
    const ok = await createLedgerEntry({
      type: 'sale', crop, quantity: q, unit, price_per_unit: p,
      buyer: buyer || undefined, market_modal_at_sale: snapshot(crop), occurred_at: date,
    });
    setSaving(false);
    if (ok) { setQuantity(''); setPrice(''); setBuyer(''); setOpen(false); reload(); }
  }
  async function remove(id: string) { if (await deleteLedgerEntry(id)) reload(); }

  return (
    <div className="space-y-4">
      {analysis && analysis.underMarketCount > 0 && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('undersellingAlert', { count: analysis.underMarketCount, loss: rupee(analysis.estimatedLossFromUnderselling) })}</span>
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-300 py-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
          <Plus className="h-4 w-4" /> {t('addSale')}
        </button>
      ) : (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
          {marketModal ? <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-700">{t('currentMarket', { price: rupee(marketModal) })}</p> : null}
          <Field label={t('crop')}><input value={crop} onChange={(e) => setCrop(e.target.value)} className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('quantity')}><input type="number" inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputCls} /></Field>
            <Field label={t('category')}>
              <select value={unit} onChange={(e) => setUnit(e.target.value as 'quintal' | 'kg')} className={inputCls}>
                <option value="quintal">{t('unitQuintal')}</option>
                <option value="kg">{t('unitKg')}</option>
              </select>
            </Field>
          </div>
          <Field label={t('pricePerUnit')}><input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} /></Field>
          <Field label={t('buyer')}><input value={buyer} onChange={(e) => setBuyer(e.target.value)} className={inputCls} /></Field>
          <Field label={t('date')}><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} /></Field>
          <div className="flex gap-2">
            <button onClick={submit} disabled={saving || !crop || !quantity || !price} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-40">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}{t('save')}
            </button>
            <button onClick={() => setOpen(false)} className="rounded-xl border border-gray-300 px-4 py-2.5 text-sm text-gray-600">{t('cancel')}</button>
          </div>
        </section>
      )}

      <ul className="space-y-2">
        {sales.length === 0 && (
          <li className="rounded-2xl border border-dashed border-gray-200 bg-white p-6 text-center text-sm text-gray-400">{t('noEntries')}</li>
        )}
        {sales.map((s) => (
          <li key={s.entry_id} className="rounded-2xl bg-white p-3.5 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-800">{s.crop} · {s.quantity} {s.unit === 'kg' ? t('unitKg') : t('unitQuintal')}{s.buyer ? ` · ${s.buyer}` : ''}</p>
                <p className="text-xs text-gray-400">{rupee(s.price_per_unit)}/{s.unit === 'kg' ? t('unitKg') : t('unitQuintal')} · {s.occurred_at}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-900">{rupee(s.amount)}</span>
                <button onClick={() => remove(s.entry_id)} className="text-gray-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <SaleBadge cmp={cmpById.get(s.entry_id)} t={t} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function SaleBadge({ cmp, t }: { cmp?: SaleComparison; t: (k: string) => string }) {
  if (!cmp || cmp.status === 'unknown') {
    return <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-gray-400">{t('marketUnknown')}</span>;
  }
  const map = {
    above: { cls: 'bg-emerald-50 text-emerald-700', Icon: TrendingUp, label: t('aboveMarket') },
    below: { cls: 'bg-red-50 text-red-600', Icon: TrendingDown, label: t('belowMarket') },
    at: { cls: 'bg-slate-100 text-gray-500', Icon: Minus, label: t('atMarket') },
  }[cmp.status];
  const Icon = map.Icon;
  return (
    <span className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${map.cls}`}>
      <Icon className="h-3 w-3" /> {map.label} ({cmp.deltaPerQtl >= 0 ? '+' : ''}₹{cmp.deltaPerQtl}/qtl)
    </span>
  );
}
