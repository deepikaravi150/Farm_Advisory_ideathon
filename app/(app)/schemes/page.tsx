'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2, Search, Landmark, SlidersHorizontal } from 'lucide-react';
import type { SchemeMatch, MatchStatus } from '@/lib/schemes/types';
import SchemeCard from '@/components/schemes/SchemeCard';
import SchemeDetail from '@/components/schemes/SchemeDetail';

interface ApiResp {
  facts: { district: string | null; landAreaAcres: number | null; crops: string[] };
  missingFields: string[];
  counts: { eligible: number; likely: number; check: number; total: number };
  schemes: SchemeMatch[];
}

type Filter = 'all' | MatchStatus;

export default function SchemesPage() {
  const t = useTranslations('schemes');
  const [data, setData] = useState<ApiResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<SchemeMatch | null>(null);

  useEffect(() => {
    fetch('/api/farmer/schemes')
      .then((r) => r.json())
      .then((d) => setData(d.error ? { schemes: [], counts: { eligible: 0, likely: 0, check: 0, total: 0 }, missingFields: [], facts: { district: null, landAreaAcres: null, crops: [] } } : d))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.schemes.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (q) {
        const hay = `${m.scheme.name} ${m.scheme.department ?? ''} ${m.scheme.category ?? ''} ${m.scheme.benefits}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, query, filter]);

  const chips: { key: Filter; label: string; count: number }[] = data
    ? [
        { key: 'all', label: t('all'), count: data.counts.total },
        { key: 'eligible', label: t('statusEligible'), count: data.counts.eligible },
        { key: 'likely', label: t('statusLikely'), count: data.counts.likely },
        { key: 'check', label: t('statusCheck'), count: data.counts.check },
      ]
    : [];

  if (loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm text-gray-500">{t('loading')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 pb-28 pt-5">
      <div className="mb-1 flex items-center gap-2">
        <Landmark className="h-5 w-5 text-brand-700" />
        <h1 className="text-xl font-bold text-gray-900">{t('title')}</h1>
      </div>
      <p className="mb-4 text-sm text-gray-500">{t('subtitle')}</p>

      {/* Nudge to complete profile for sharper matches */}
      {data && data.missingFields.length > 0 && (
        <Link href="/profile" className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 hover:bg-amber-100">
          <SlidersHorizontal className="h-4 w-4 shrink-0" />
          <span className="flex-1">{t('missingPrompt')}</span>
          <span className="font-semibold underline">{t('updateProfile')}</span>
        </Link>
      )}

      {/* Search */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400"
        />
      </div>

      {/* Status filter chips */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => (
          <button
            key={c.key}
            onClick={() => setFilter(c.key)}
            className={`flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              filter === c.key ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 ring-1 ring-gray-200'
            }`}
          >
            {c.label}
            <span className={`rounded-full px-1.5 text-[10px] ${filter === c.key ? 'bg-white/25' : 'bg-gray-100 text-gray-500'}`}>{c.count}</span>
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="mt-12 text-center text-sm text-gray-400">{t('noResults')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map((m) => (
            <SchemeCard key={m.scheme.id} match={m} onClick={() => setSelected(m)} />
          ))}
        </div>
      )}

      {selected && <SchemeDetail match={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
