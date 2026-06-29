'use client';
import { useTranslations } from 'next-intl';
import { ChevronLeft, CheckCircle2, AlertCircle, ExternalLink, Building2, MapPin } from 'lucide-react';
import type { SchemeMatch } from '@/lib/schemes/types';
import { cleanSchemeText } from '@/lib/schemes/format';
import SchemeBadge from './SchemeBadge';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-400">{title}</h4>
      {children}
    </section>
  );
}

function Body({ text }: { text?: string }) {
  const clean = cleanSchemeText(text);
  if (!clean) return null;
  return <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{clean}</p>;
}

export default function SchemeDetail({ match, onClose }: { match: SchemeMatch; onClose: () => void }) {
  const t = useTranslations('schemes');
  const { scheme, status, matchedOn, unknownConditions } = match;

  return (
    <div className="fixed inset-0 z-50 mx-auto flex max-w-md flex-col bg-white">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-gray-100 bg-white/95 px-3 py-3 backdrop-blur">
        <button onClick={onClose} aria-label={t('back')} className="rounded-lg p-1.5 hover:bg-gray-100">
          <ChevronLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div className="flex flex-1 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            <MapPin className="h-3 w-3" />
            {scheme.level === 'Central' ? t('levelCentral') : t('levelState')}
          </span>
          <SchemeBadge status={status} />
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pb-24 pt-3">
        <h2 className="text-lg font-bold leading-snug text-gray-900">{scheme.name}</h2>
        {scheme.department && (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {scheme.department}
          </p>
        )}
        {scheme.brief && <p className="mt-3 text-sm leading-relaxed text-gray-600">{cleanSchemeText(scheme.brief)}</p>}

        {matchedOn.length > 0 && (
          <div className="mt-4 rounded-xl bg-green-50 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-green-700">{t('whyQualify')}</p>
            <ul className="space-y-1">
              {matchedOn.map((m, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-green-800">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> {m}
                </li>
              ))}
            </ul>
          </div>
        )}

        {unknownConditions.length > 0 && (
          <div className="mt-3 rounded-xl bg-amber-50 p-3">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">{t('toConfirm')}</p>
            <ul className="space-y-1">
              {unknownConditions.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm text-amber-800">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {c}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Section title={t('benefits')}><Body text={scheme.benefits} /></Section>
        <Section title={t('eligibility')}><Body text={scheme.eligibility} /></Section>

        {scheme.process?.some((p) => p.md) && (
          <Section title={t('howToApply')}>
            {scheme.process.map((p, i) => (
              <div key={i} className="mb-2">
                {p.mode && <p className="mb-0.5 text-xs font-semibold text-gray-500">{p.mode}</p>}
                <Body text={p.md} />
              </div>
            ))}
          </Section>
        )}

        {scheme.documents && <Section title={t('documents')}><Body text={scheme.documents} /></Section>}

        {scheme.references?.length > 0 && (
          <Section title={t('source')}>
            <div className="space-y-1.5">
              {scheme.references.map((r, i) => (
                <a
                  key={i}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" /> {r.title}
                </a>
              ))}
            </div>
          </Section>
        )}

        <p className="mt-6 rounded-lg bg-gray-50 p-3 text-[11px] leading-relaxed text-gray-400">{t('disclaimer')}</p>
      </div>
    </div>
  );
}
