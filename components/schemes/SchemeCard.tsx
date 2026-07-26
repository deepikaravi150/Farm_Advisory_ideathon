'use client';
import { useTranslations } from 'next-intl';
import { CheckCircle2, ChevronRight, MapPin, Building2 } from 'lucide-react';
import type { SchemeMatch } from '@/lib/schemes/types';
import { snippet } from '@/lib/schemes/format';
import SchemeBadge from './SchemeBadge';

export default function SchemeCard({ match, onClick }: { match: SchemeMatch; onClick: () => void }) {
  const t = useTranslations('schemes');
  const { scheme, status, matchedOn } = match;

  return (
    <button
      onClick={onClick}
      className="w-full rounded-2xl border border-gray-100 bg-white p-4 text-left shadow-sm transition hover:border-brand-200 hover:bg-brand-50/40"
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
          <MapPin className="h-3 w-3" />
          {scheme.level === 'Central' ? t('levelCentral') : t('levelState')}
        </span>
        <SchemeBadge status={status} />
      </div>

      <h3 className="text-sm font-semibold leading-snug text-gray-900">{scheme.name}</h3>

      {scheme.department && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-gray-400">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{scheme.department}</span>
        </p>
      )}

      <p className="mt-2 line-clamp-2 text-xs text-gray-600">{snippet(scheme.benefits, 130)}</p>

      {matchedOn[0] && (
        <p className="mt-2 flex items-center gap-1 text-[11px] font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{matchedOn[0]}</span>
        </p>
      )}

      <div className="mt-1 flex justify-end">
        <ChevronRight className="h-4 w-4 text-gray-300" />
      </div>
    </button>
  );
}
