'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, CheckCircle2, Circle, CalendarClock, MessageCircle, Sprout, AlertTriangle, Sun } from 'lucide-react';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import PestAlertWidget from '@/components/dashboard/PestAlertWidget';
import type { TodayPlan } from '@/lib/today-plan';

interface Props {
  base: TodayPlan;
  locale: string;
  farmerName: string;
  dateLabel: string;
}

export default function TodayView({ base, locale, farmerName, dateLabel }: Props) {
  const router = useRouter();
  const [focus, setFocus] = useState('');
  const [focusLoading, setFocusLoading] = useState(true);
  const [done, setDone] = useState<Record<number, boolean>>({});

  const todayKey = new Date().toISOString().split('T')[0];
  const storageKey = `today-done:${todayKey}`;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setDone(JSON.parse(saved));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    let cancelled = false;
    setFocusLoading(true);
    fetch(`/api/today?locale=${locale}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setFocus(typeof d.focus === 'string' ? d.focus : ''); })
      .catch(() => { /* keep silent */ })
      .finally(() => { if (!cancelled) setFocusLoading(false); });
    return () => { cancelled = true; };
  }, [locale]);

  function toggle(i: number) {
    setDone((prev) => {
      const next = { ...prev, [i]: !prev[i] };
      try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  const firstName = farmerName.split(/[\s-]/)[0];

  return (
    <div className="px-4 pb-40 pt-5">
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Hello, {firstName} 👋</h1>
          <p className="text-sm text-gray-500">{dateLabel}</p>
        </div>
        <LanguageSwitcher />
      </div>

      {/* AI focus */}
      <div className="mb-4 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-sm">
        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-brand-100">
          <Sparkles className="h-3.5 w-3.5" /> Today&apos;s focus
        </div>
        {focusLoading ? (
          <div className="space-y-2">
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-white/30" />
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-white/20" />
          </div>
        ) : (
          <p className="text-[15px] font-medium leading-snug">
            {focus || 'Open your crop plan to see what to do today.'}
          </p>
        )}
      </div>

      {/* Pest-outbreak alerts near the farmer (renders nothing when none) */}
      <PestAlertWidget />

      {/* Weather alert — only when bad for the crop */}
      {base.weatherAlert ? (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 font-semibold text-amber-800">
            <AlertTriangle className="h-4 w-4" />
            <span>{base.weatherAlert.emoji} {base.weatherAlert.title}</span>
          </div>
          <p className="mt-1 text-sm text-amber-800/90">{base.weatherAlert.detail}</p>
          <p className="mt-2 rounded-lg bg-white/60 px-3 py-2 text-sm font-medium text-amber-900">
            {base.weatherAlert.action}
          </p>
        </div>
      ) : base.hasActivePlan ? (
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Sun className="h-4 w-4" /> Weather is fine for your crop this week.
        </div>
      ) : null}

      {/* No plan yet */}
      {!base.hasActivePlan && (
        <div className="rounded-2xl border border-dashed border-brand-300 bg-white p-6 text-center">
          <Sprout className="mx-auto h-8 w-8 text-brand-500" />
          <h2 className="mt-2 font-semibold text-gray-900">No crop plan yet</h2>
          <p className="mt-1 text-sm text-gray-500">Create a plan to get a daily to-do list tailored to your field.</p>
          <button
            onClick={() => router.push('/plan')}
            className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Build my crop plan
          </button>
        </div>
      )}

      {/* Today's tasks */}
      {base.todayTasks.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">To do today</h2>
          <ul className="space-y-2">
            {base.todayTasks.map((task, i) => {
              const checked = !!done[i];
              return (
                <li key={i}>
                  <button
                    onClick={() => toggle(i)}
                    className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                      task.alert ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-white'
                    } ${checked ? 'opacity-60' : ''}`}
                  >
                    {checked
                      ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
                      : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />}
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium uppercase text-gray-400">{task.crop}</span>
                      <span className={`block text-sm text-gray-800 ${checked ? 'line-through' : ''}`}>{task.text}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Prepare ahead */}
      {base.prepareAhead.length > 0 && (
        <section className="mb-4">
          <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-gray-400">
            <CalendarClock className="h-4 w-4" /> Prepare ahead
          </h2>
          <ul className="space-y-2">
            {base.prepareAhead.map((p, i) => (
              <li key={i} className="flex items-center justify-between rounded-2xl bg-white p-3.5 shadow-sm">
                <div className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase text-gray-400">{p.crop}</span>
                  <span className="block truncate text-sm text-gray-800">{p.text}</span>
                </div>
                <span className="ml-3 shrink-0 rounded-full bg-earth-100 px-2.5 py-1 text-xs font-semibold text-earth-700">
                  in {p.daysAway}d
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sticky check-in button (sits above the tab bar) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-40 mx-auto max-w-md px-4">
        <button
          onClick={() => router.push('/chat?mode=checkin')}
          className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-900 py-3.5 font-semibold text-white shadow-lg active:scale-[0.99]"
        >
          <MessageCircle className="h-5 w-5" />
          Daily check-in
        </button>
      </div>
    </div>
  );
}
