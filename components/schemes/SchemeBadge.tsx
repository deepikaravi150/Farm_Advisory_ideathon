'use client';
import { useTranslations } from 'next-intl';
import type { MatchStatus } from '@/lib/schemes/types';

const STYLES: Record<MatchStatus, string> = {
  eligible: 'bg-green-100 text-green-700',
  likely: 'bg-amber-100 text-amber-700',
  check: 'bg-slate-100 text-slate-600',
};

const KEY: Record<MatchStatus, string> = {
  eligible: 'statusEligible',
  likely: 'statusLikely',
  check: 'statusCheck',
};

export default function SchemeBadge({ status }: { status: MatchStatus }) {
  const t = useTranslations('schemes');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${STYLES[status]}`}>
      {t(KEY[status])}
    </span>
  );
}
