'use client';
import { Activity, CalendarClock, Droplets, ArrowRight, CheckCircle2 } from 'lucide-react';

type Locale = 'en' | 'hi' | 'ta';
type StageStatus = 'done' | 'active' | 'pending' | 'alert';

export interface StageProgress {
  id: string;
  label: string;
  status: StageStatus;
  date: string;
  endDate: string;
}

interface Props {
  cropName: string;
  stages: StageProgress[];
  currentId: string | null;
  insight: { summary: string; water: string; action: string } | null;
  risk: string; // already localized
  riskLevel: 'High' | 'Medium' | 'Low';
  locale: Locale;
}

const SEG_COLOR: Record<StageStatus, string> = {
  done: 'bg-emerald-500',
  active: 'bg-brand-500',
  alert: 'bg-red-500',
  pending: 'bg-gray-200',
};

export default function CurrentStageSection({ cropName, stages, currentId, insight, risk, riskLevel, locale }: Props) {
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
  const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : '');

  const total = stages.length;
  const currentIdx = Math.max(0, stages.findIndex((s) => s.id === currentId));
  const current = stages[currentIdx];
  const doneCount = stages.filter((s) => s.status === 'done').length;

  const riskBadge =
    riskLevel === 'High' ? 'bg-red-50 text-red-700' :
    riskLevel === 'Medium' ? 'bg-amber-50 text-amber-700' :
    'bg-emerald-50 text-emerald-700';

  return (
    <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
          <Activity className="h-3.5 w-3.5" /> {t('Current ongoing stage', 'वर्तमान चालू चरण', 'தற்போது நடப்பு கட்டம்')}
        </p>
        <span className="text-xs text-gray-500">
          {t('Stage', 'चरण', 'கட்டம்')} {Math.min(currentIdx + 1, total)} / {total} · {doneCount} {t('done', 'पूर्ण', 'முடிந்தது')}
        </span>
      </div>

      {/* Segmented progress across all stages */}
      <div className="mt-3 flex gap-1">
        {stages.map((s) => (
          <div
            key={s.id}
            title={`${s.label} (${fmt(s.date)})`}
            className={`h-2 flex-1 rounded-full ${SEG_COLOR[s.status]} ${s.id === currentId ? 'ring-2 ring-brand-300' : ''}`}
          />
        ))}
      </div>

      {current ? (
        <div className="mt-4 rounded-xl bg-emerald-50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{current.label}</h3>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-600">
                <CalendarClock className="h-3.5 w-3.5 text-emerald-600" />
                {fmt(current.date)}{current.endDate && current.endDate !== current.date ? ` – ${fmt(current.endDate)}` : ''}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${riskBadge}`}>
              {t('Risk', 'जोखिम', 'ஆபத்து')}: {risk}
            </span>
          </div>

          {insight?.summary && <p className="mt-3 text-sm leading-6 text-gray-700">{insight.summary}</p>}

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {insight?.action && (
              <div className="flex gap-2 rounded-lg bg-white p-3 text-sm text-gray-700">
                <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Next action', 'अगला काम', 'அடுத்த செயல்')}</p>
                  <p>{insight.action}</p>
                </div>
              </div>
            )}
            {insight?.water && (
              <div className="flex gap-2 rounded-lg bg-white p-3 text-sm text-gray-700">
                <Droplets className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t('Water / irrigation', 'पानी / सिंचाई', 'நீர் / பாசனம்')}</p>
                  <p>{insight.water}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 flex items-center gap-2 text-sm text-gray-500">
          <CheckCircle2 className="h-4 w-4 text-emerald-500" /> {t(`${cropName} plan is complete.`, `${cropName} योजना पूरी हो गई।`, `${cropName} திட்டம் முடிந்தது.`)}
        </p>
      )}
    </div>
  );
}
