'use client';
import { useTranslations } from 'next-intl';
import {
  Calendar, IndianRupee, AlertTriangle, CheckCircle2, CircleDot,
  CloudSun, Sprout, Tractor, Wheat, PackageCheck, Droplets, Bug, ShieldCheck,
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import type { Milestone, CropPlan } from '@/lib/types/crop-plan';

// A vibrant accent palette cycled across stages — keeps the timeline colourful
// and project-management-like while staying readable.
const ACCENTS = [
  { bar: 'bg-emerald-500', ring: 'ring-emerald-200', soft: 'bg-emerald-50', text: 'text-emerald-700', dot: 'from-emerald-400 to-emerald-600' },
  { bar: 'bg-sky-500', ring: 'ring-sky-200', soft: 'bg-sky-50', text: 'text-sky-700', dot: 'from-sky-400 to-sky-600' },
  { bar: 'bg-amber-500', ring: 'ring-amber-200', soft: 'bg-amber-50', text: 'text-amber-700', dot: 'from-amber-400 to-amber-600' },
  { bar: 'bg-violet-500', ring: 'ring-violet-200', soft: 'bg-violet-50', text: 'text-violet-700', dot: 'from-violet-400 to-violet-600' },
  { bar: 'bg-rose-500', ring: 'ring-rose-200', soft: 'bg-rose-50', text: 'text-rose-700', dot: 'from-rose-400 to-rose-600' },
  { bar: 'bg-teal-500', ring: 'ring-teal-200', soft: 'bg-teal-50', text: 'text-teal-700', dot: 'from-teal-400 to-teal-600' },
];

// Pick a sensible icon from the stage label.
function stageIcon(label: string) {
  const l = label.toLowerCase();
  if (l.includes('prepar') || l.includes('land') || l.includes('plough')) return Tractor;
  if (l.includes('sow') || l.includes('plant') || l.includes('seed') || l.includes('transplant')) return Sprout;
  if (l.includes('irrig') || l.includes('water')) return Droplets;
  if (l.includes('fertil') || l.includes('nutrient') || l.includes('manure')) return CloudSun;
  if (l.includes('pest') || l.includes('disease') || l.includes('weed')) return Bug;
  if (l.includes('harvest')) return Wheat;
  if (l.includes('store') || l.includes('storage') || l.includes('sell') || l.includes('market')) return PackageCheck;
  return ShieldCheck;
}

/** Derive a status from dates when the backend didn't set one (alerts win). */
function deriveStatus(m: Milestone): NonNullable<Milestone['status']> {
  if (m.status) return m.status;
  const today = new Date().toISOString().split('T')[0];
  const end = m.endDate ?? m.date;
  if (end < today) return 'done';
  if (m.date <= today && today <= end) return 'active';
  return 'pending';
}

/** Render tasks as bullets when the AI used "- " markers, else as a paragraph. */
function Tasks({ text }: { text: string }) {
  const lines = text.split('\n').map((l) => l.replace(/^\s*[-*•]\s*/, '').trim()).filter(Boolean);
  if (lines.length > 1) {
    return (
      <ul className="space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
            <span>{l}</span>
          </li>
        ))}
      </ul>
    );
  }
  return <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>;
}

interface Props {
  plan: CropPlan;
}

export default function PlanTimeline({ plan }: Props) {
  const t = useTranslations('planChart');
  const milestones = plan.milestones ?? [];
  const alertCount = milestones.filter((m) => m.alert).length;

  return (
    <div>
      {/* Summary header */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-emerald-500 text-white p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <Sprout className="w-6 h-6" />
            <span className="text-xl font-bold">{plan.cropName}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <span className="bg-white/20 rounded-full px-3 py-1 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {plan.startDate ? formatDate(plan.startDate) : '—'} → {plan.harvestDate ? formatDate(plan.harvestDate) : '—'}
            </span>
            <span className="bg-white/20 rounded-full px-3 py-1 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5" />
              {t('totalBudget')}: ₹{(plan.totalBudgetEstimate ?? 0).toLocaleString('en-IN')}
            </span>
            {plan.sellWindow && (
              <span className="bg-white/20 rounded-full px-3 py-1">{t('sellWindow')}: {plan.sellWindow}</span>
            )}
            {alertCount > 0 && (
              <span className="bg-red-500 rounded-full px-3 py-1 flex items-center gap-1.5 font-medium">
                <AlertTriangle className="w-3.5 h-3.5" /> {t('alertsCount', { count: alertCount })}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Vertical timeline */}
      <div className="relative pl-2">
        {milestones.map((m, i) => {
          const accent = ACCENTS[i % ACCENTS.length];
          const status = deriveStatus(m);
          const Icon = stageIcon(m.label);
          const isLast = i === milestones.length - 1;
          return (
            <div key={m.id ?? i} className="relative flex gap-4 pb-6">
              {/* Rail + node */}
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${accent.dot} text-white flex items-center justify-center shadow ring-4 ${accent.ring}`}>
                  <Icon className="w-5 h-5" />
                </div>
                {!isLast && <div className={`w-0.5 flex-1 mt-1 ${accent.bar} opacity-30`} />}
              </div>

              {/* Stage card */}
              <div className={`flex-1 rounded-2xl border bg-white shadow-sm overflow-hidden ${m.alert ? 'border-red-200' : 'border-gray-100'}`}>
                <div className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${accent.soft}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold ${accent.text}`}>{t('stage')} {i + 1}</span>
                    <h4 className="font-semibold text-gray-800">{m.label}</h4>
                    {status === 'done' && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                    {status === 'active' && <CircleDot className="w-4 h-4 text-brand-600" />}
                  </div>
                  <span className="text-xs text-gray-600 bg-white rounded-full px-2.5 py-1 flex items-center gap-1 border border-gray-200">
                    <Calendar className="w-3 h-3" />
                    {formatDate(m.date)}{m.endDate && m.endDate !== m.date ? ` – ${formatDate(m.endDate)}` : ''}
                    {m.durationDays ? ` · ${m.durationDays} ${t('days')}` : ''}
                  </span>
                </div>

                <div className="px-4 py-3 space-y-3">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('whatToDo')}</p>
                    <Tasks text={m.tasks ?? ''} />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {m.estimatedCost > 0 && (
                      <span className="text-xs bg-earth-50 text-earth-700 rounded-full px-2.5 py-1 flex items-center gap-1 border border-earth-200">
                        <IndianRupee className="w-3 h-3" />₹{m.estimatedCost.toLocaleString('en-IN')}
                      </span>
                    )}
                    {m.weatherRequirement && (
                      <span className="text-xs bg-sky-50 text-sky-700 rounded-full px-2.5 py-1 flex items-center gap-1 border border-sky-200">
                        <CloudSun className="w-3 h-3" />{m.weatherRequirement}
                      </span>
                    )}
                  </div>

                  {m.weatherSummary && (
                    <div className="rounded-xl bg-sky-50/70 border border-sky-100 p-3">
                      <p className="text-xs font-semibold text-sky-700 mb-1 flex items-center gap-1">
                        <CloudSun className="w-3.5 h-3.5" />{t('forecastForStage')}
                      </p>
                      <pre className="text-xs text-sky-800 whitespace-pre-wrap font-sans leading-relaxed">{m.weatherSummary}</pre>
                    </div>
                  )}

                  {m.alert && m.alertAdvice && (
                    <div className="rounded-xl bg-red-50 border border-red-200 p-3 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-red-700 mb-0.5">{t('weatherAlert')}</p>
                        <p className="text-sm text-red-700">{m.alertAdvice}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
