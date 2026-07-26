'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  IndianRupee, TrendingUp, TrendingDown, Minus, Sprout, Lightbulb, Loader2,
  AlertTriangle, Wallet, ShoppingBasket, Landmark,
} from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import type { FinancialEntry, FinancialAnalysis } from '@/lib/money/types';
import ExpensesTab from './ExpensesTab';
import SalesTab from './SalesTab';
import LoansTab from './LoansTab';
import { rupee } from './shared';

interface Market { market: string; district: string; variety: string; modal: number }
interface MarketResp { available: boolean; commodity?: string; avgModal?: number; trend?: 'up' | 'down' | 'flat' | null; date?: string | null; markets?: Market[] }
interface MoneyResp { hasPlan: boolean; crop?: string; expense?: number; estimatedRevenue?: string; projectedProfit?: string; margin?: string; tips?: string[] }

type Tab = 'overview' | 'expenses' | 'sales' | 'loans';

export default function MoneyView({ hasPlan, cropName, marketCommodity }: { hasPlan: boolean; cropName: string; marketCommodity: string }) {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations('money');

  const [tab, setTab] = useState<Tab>('overview');
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [analysis, setAnalysis] = useState<FinancialAnalysis | null>(null);
  const [market, setMarket] = useState<MarketResp | null>(null);
  const [money, setMoney] = useState<MoneyResp | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [lRes, aRes] = await Promise.all([
      fetch('/api/money/ledger'),
      fetch(`/api/money/analysis?locale=${locale}`),
    ]);
    if (lRes.ok) setEntries((await lRes.json()).entries ?? []);
    if (aRes.ok) setAnalysis(await aRes.json());
  }, [locale]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      let avg = 0;
      try {
        if (marketCommodity) {
          const m: MarketResp = await (await fetch(`/api/market-prices?commodity=${encodeURIComponent(marketCommodity)}&locale=${locale}`)).json();
          if (!cancelled) setMarket(m);
          if (m.available && m.avgModal) avg = m.avgModal;
        }
      } catch { /* market optional */ }
      if (hasPlan) {
        try {
          const mo: MoneyResp = await (await fetch(`/api/money?locale=${locale}&marketModal=${avg}`)).json();
          if (!cancelled) setMoney(mo);
        } catch { /* outlook optional */ }
      }
      await reload();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [hasPlan, marketCommodity, locale, reload]);

  const marketCrop = market?.commodity || cropName;

  return (
    <div className="px-4 pb-28 pt-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900"><IndianRupee className="h-5 w-5 text-brand-600" /> {t('title')}</h1>
          <p className="text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        <LanguageSwitcher />
      </div>

      {/* Tabs */}
      <div className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1">
        <TabBtn active={tab === 'overview'} onClick={() => setTab('overview')} label={t('tabOverview')} />
        <TabBtn active={tab === 'expenses'} onClick={() => setTab('expenses')} label={t('tabExpenses')} Icon={Wallet} />
        <TabBtn active={tab === 'sales'} onClick={() => setTab('sales')} label={t('tabSales')} Icon={ShoppingBasket} />
        <TabBtn active={tab === 'loans'} onClick={() => setTab('loans')} label={t('tabLoans')} Icon={Landmark} />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-brand-600" /></div>
      ) : (
        <div className="mt-4">
          {tab === 'overview' && <Overview t={t} analysis={analysis} market={market} money={money} hasPlan={hasPlan} cropName={cropName} onBuildPlan={() => router.push('/plan')} />}
          {tab === 'expenses' && <ExpensesTab entries={entries} analysis={analysis} reload={reload} />}
          {tab === 'sales' && <SalesTab entries={entries} analysis={analysis} reload={reload} marketModal={market?.avgModal} marketCrop={marketCrop} />}
          {tab === 'loans' && <LoansTab entries={entries} analysis={analysis} reload={reload} />}
        </div>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, label, Icon }: { active: boolean; onClick: () => void; label: string; Icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${active ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500'}`}>
      {Icon && <Icon className="h-3.5 w-3.5" />} {label}
    </button>
  );
}

function Overview({
  t, analysis, market, money, hasPlan, cropName, onBuildPlan,
}: {
  t: (k: string, v?: Record<string, string | number>) => string;
  analysis: FinancialAnalysis | null; market: MarketResp | null; money: MoneyResp | null;
  hasPlan: boolean; cropName: string; onBuildPlan: () => void;
}) {
  const net = analysis?.netProfit ?? 0;
  const hasActuals = !!analysis && (analysis.counts.expenses + analysis.counts.sales + analysis.counts.loans > 0);
  const TrendIcon = market?.trend === 'up' ? TrendingUp : market?.trend === 'down' ? TrendingDown : Minus;
  const trendColor = market?.trend === 'up' ? 'text-emerald-600' : market?.trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div className="space-y-4">
      {/* Actuals summary */}
      <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white">
        <div className="mb-2 text-xs font-medium text-brand-100">{t('actualsTitle')}</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label={t('totalSpent')} value={rupee(analysis?.totalExpenses)} />
          <Stat label={t('totalEarned')} value={rupee(analysis?.totalRevenue)} />
          <Stat label={net >= 0 ? t('netProfit') : t('netLoss')} value={rupee(Math.abs(net))} highlight />
        </div>
      </div>

      {/* Over-budget banner */}
      {analysis?.loanSummary.overBudget && (
        <div className="flex items-start gap-2 rounded-2xl border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><strong>{t('overBudgetTitle')}</strong><br />{t('overBudgetDesc', { spent: rupee(analysis.loanSummary.totalExpenses), loans: rupee(analysis.loanSummary.totalLoans) })}</span>
        </div>
      )}

      {/* AI insight */}
      {hasActuals && analysis && (
        <section className="rounded-2xl bg-earth-50 p-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-earth-800"><Lightbulb className="h-4 w-4" /> {t('insight')}</h2>
          <ul className="space-y-1.5">
            {[analysis.narrative.healthSummary, analysis.narrative.topSpendArea, analysis.narrative.sellingAdvice, analysis.narrative.loanWarning]
              .filter(Boolean)
              .map((line, i) => (
                <li key={i} className="flex gap-2 text-sm text-earth-900"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-earth-500" /> {line}</li>
              ))}
          </ul>
        </section>
      )}

      {/* Plan-based profit outlook (estimate) */}
      {hasPlan && money?.hasPlan && (
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-gray-500"><TrendingUp className="h-3.5 w-3.5" /> {t('outlookTitle')} · {money.crop ?? cropName}</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <OutStat label={t('expense')} value={money.expense ? rupee(money.expense) : '—'} />
            <OutStat label={t('revenue')} value={money.estimatedRevenue ?? '—'} />
            <OutStat label={t('profit')} value={money.projectedProfit ?? '—'} />
          </div>
          {money.margin && <p className="mt-3 text-xs text-gray-500">{money.margin}</p>}
        </div>
      )}

      {/* Market price */}
      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800"><IndianRupee className="h-4 w-4 text-brand-600" /> {t('marketPrice')}</h2>
          {market?.available && market.avgModal ? (
            <span className={`flex items-center gap-1 text-sm font-bold ${trendColor}`}><TrendIcon className="h-4 w-4" /> {rupee(market.avgModal)}{t('perQtl')}</span>
          ) : null}
        </div>
        {market?.available && market.markets?.length ? (
          <ul className="mt-3 space-y-2">
            {market.markets.slice(0, 4).map((m, i) => (
              <li key={i} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium text-gray-800">{m.market || m.district}</span><span className="block truncate text-xs text-gray-400">{m.variety || m.district}</span></span>
                <span className="ml-3 shrink-0 font-semibold text-gray-700">{rupee(m.modal)}</span>
              </li>
            ))}
            {market.date && <p className="pt-1 text-[11px] text-gray-400">{t('source')}: data.gov.in · {market.date}</p>}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-gray-500">{t('noLivePrice')}</p>
        )}
      </section>

      {/* No plan → nudge (does not block the rest) */}
      {!hasPlan && (
        <div className="rounded-2xl border border-dashed border-brand-300 bg-white p-6 text-center">
          <Sprout className="mx-auto h-8 w-8 text-brand-500" />
          <h2 className="mt-2 font-semibold text-gray-900">{t('noPlan')}</h2>
          <p className="mt-1 text-sm text-gray-500">{t('noPlanDesc')}</p>
          <button onClick={onBuildPlan} className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">{t('buildPlan')}</button>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-2 ${highlight ? 'bg-white/20' : 'bg-white/10'}`}>
      <div className="text-[11px] text-brand-100">{label}</div>
      <div className="mt-0.5 text-sm font-bold leading-tight">{value}</div>
    </div>
  );
}

function OutStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2">
      <div className="text-[11px] text-gray-400">{label}</div>
      <div className="mt-0.5 text-sm font-bold leading-tight text-gray-800">{value}</div>
    </div>
  );
}
