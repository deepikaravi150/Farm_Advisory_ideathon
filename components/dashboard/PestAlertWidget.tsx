'use client';

import { useEffect, useState } from 'react';
import { Bug, ShieldCheck, Loader2 } from 'lucide-react';

interface PestAlert {
  pestKey: string;
  pestLabel: string;
  cropName: string;
  distanceKm: number;
  prevention: string[];
}

/**
 * Shows pending pest-outbreak alerts near the farmer's field with two actions:
 * "No pest on my crop" (suppress) and "I have it too" (expands the alert to the
 * farmer's own neighbours). Renders nothing when there are no alerts.
 */
export default function PestAlertWidget() {
  const [alerts, setAlerts] = useState<PestAlert[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch('/api/pest-alert')
      .then((r) => r.json())
      .then((d) => setAlerts(Array.isArray(d.alerts) ? d.alerts : []))
      .catch(() => { /* keep silent */ });
  }, []);

  async function respond(pestKey: string, response: 'clear' | 'confirm') {
    setBusy(pestKey);
    try {
      const res = await fetch('/api/pest-alert/respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pestKey, response }),
      });
      const data = await res.json();
      if (response === 'confirm' && res.ok) {
        setNote((n) => ({ ...n, [pestKey]: `Alerted ${data.spread ?? 0} nearby farmer(s). Follow the treatment steps and keep monitoring.` }));
        setTimeout(() => setAlerts((a) => a.filter((x) => x.pestKey !== pestKey)), 2500);
      } else if (res.ok) {
        setAlerts((a) => a.filter((x) => x.pestKey !== pestKey));
      }
    } catch {
      /* keep the card so they can retry */
    } finally {
      setBusy(null);
    }
  }

  if (!alerts.length) return null;

  return (
    <section className="mb-4 space-y-3">
      {alerts.map((a) => {
        const dist = a.distanceKm < 1 ? a.distanceKm.toFixed(1) : Math.round(a.distanceKm).toString();
        return (
          <div key={a.pestKey} className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 font-semibold text-red-800">
              <Bug className="h-4 w-4 shrink-0" />
              <span>Pest alert nearby: {a.pestLabel}</span>
            </div>
            <p className="mt-1 text-sm text-red-800/90">
              Seen{a.cropName ? ` in ${a.cropName}` : ''} about {dist} km from your field. Check your crop now.
            </p>
            {a.prevention.length > 0 && (
              <ul className="mt-2 space-y-1 rounded-lg bg-white/70 px-3 py-2 text-sm text-red-900">
                {a.prevention.map((tip, i) => <li key={i}>• {tip}</li>)}
              </ul>
            )}
            {note[a.pestKey] ? (
              <p className="mt-3 text-sm font-medium text-red-900">{note[a.pestKey]}</p>
            ) : (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy === a.pestKey}
                  onClick={() => respond(a.pestKey, 'clear')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-red-300 bg-white py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-40"
                >
                  {busy === a.pestKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                  No pest on my crop
                </button>
                <button
                  type="button"
                  disabled={busy === a.pestKey}
                  onClick={() => respond(a.pestKey, 'confirm')}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
                >
                  {busy === a.pestKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bug className="h-4 w-4" />}
                  I have it too
                </button>
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
