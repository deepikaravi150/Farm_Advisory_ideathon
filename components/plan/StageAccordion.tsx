'use client';

import { useState } from 'react';
import { ChevronDown, CheckCircle2, AlertTriangle, Circle, Loader2, Coins, CloudSun } from 'lucide-react';
import type { Milestone } from '@/lib/types/crop-plan';

type StageStatus = 'done' | 'active' | 'alert' | 'pending';

function statusOf(m: Milestone, today: string): StageStatus {
  if (m.alert) return 'alert';
  const end = m.endDate ?? m.date;
  if (end && end < today) return 'done';
  if (m.date && end && m.date <= today && today <= end) return 'active';
  return 'pending';
}

function StatusDot({ status }: { status: StageStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
  if (status === 'alert') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
  if (status === 'active') return <Loader2 className="h-5 w-5 text-brand-600" />;
  return <Circle className="h-5 w-5 text-gray-300" />;
}

function splitLines(text?: string) {
  return (text ?? '')
    .split(/\n|(?<=[.!?।])\s+|(?:\s-\s)/)
    .map((l) => l.replace(/^[\s•\-*]+/, '').trim())
    .filter((l) => l.length > 2);
}

function formatDateRange(m: Milestone, locale: string) {
  const fmt = (d?: string) => {
    if (!d) return '';
    const dl = ({ en: 'en-IN', hi: 'hi-IN', ta: 'ta-IN' } as Record<string, string>)[locale] ?? 'en-IN';
    return new Date(`${d}T00:00:00`).toLocaleDateString(dl, { day: 'numeric', month: 'short' });
  };
  const start = fmt(m.date);
  const end = fmt(m.endDate);
  return end && end !== start ? `${start} – ${end}` : start;
}

export default function StageAccordion({ milestones, locale }: { milestones: Milestone[]; locale: string }) {
  const today = new Date().toISOString().split('T')[0];
  // Open the active stage by default; otherwise the first pending one.
  const defaultOpen = (() => {
    const activeIdx = milestones.findIndex((m) => statusOf(m, today) === 'active' || statusOf(m, today) === 'alert');
    if (activeIdx >= 0) return activeIdx;
    const pendingIdx = milestones.findIndex((m) => statusOf(m, today) === 'pending');
    return pendingIdx >= 0 ? pendingIdx : 0;
  })();
  const [open, setOpen] = useState<number | null>(defaultOpen);

  return (
    <ul className="space-y-2">
      {milestones.map((m, i) => {
        const status = statusOf(m, today);
        const isOpen = open === i;
        const tasks = splitLines(m.tasks);
        return (
          <li
            key={m.id ?? i}
            className={`overflow-hidden rounded-2xl border bg-white transition-colors ${
              status === 'active' ? 'border-brand-300' : status === 'alert' ? 'border-amber-300' : 'border-gray-100'
            }`}
          >
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="flex w-full items-center gap-3 p-3.5 text-left"
            >
              <StatusDot status={status} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold text-gray-900">{m.label}</span>
                  {status === 'active' && (
                    <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold uppercase text-brand-700">Now</span>
                  )}
                </span>
                {m.summary && !isOpen && (
                  <span className="mt-0.5 block truncate text-xs text-gray-500">{m.summary}</span>
                )}
                {formatDateRange(m, locale) && (
                  <span className="mt-0.5 block text-[11px] text-gray-400">{formatDateRange(m, locale)}</span>
                )}
              </span>
              <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
              <div className="border-t border-gray-100 px-4 pb-4 pt-3">
                {tasks.length > 0 ? (
                  <ul className="space-y-1.5">
                    {tasks.map((task, j) => (
                      <li key={j} className="flex gap-2 text-sm text-gray-700">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                        <span>{task}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-600">{m.summary}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {m.estimatedCost ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-gray-600">
                      <Coins className="h-3.5 w-3.5" /> ₹{m.estimatedCost.toLocaleString('en-IN')}
                    </span>
                  ) : null}
                  {m.weatherRequirement ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700">
                      <CloudSun className="h-3.5 w-3.5" /> {m.weatherRequirement}
                    </span>
                  ) : null}
                </div>

                {m.alert && m.alertAdvice && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {m.alertAdvice}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
