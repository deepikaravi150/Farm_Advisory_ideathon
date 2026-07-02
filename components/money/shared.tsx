'use client';
import type { ReactNode } from 'react';

export const rupee = (n?: number) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
export const today = () => new Date().toISOString().slice(0, 10);
export const inputCls =
  'w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400';

export async function createLedgerEntry(body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch('/api/money/ledger', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

export async function deleteLedgerEntry(entryId: string): Promise<boolean> {
  const res = await fetch(`/api/money/ledger?entryId=${encodeURIComponent(entryId)}`, { method: 'DELETE' });
  return res.ok;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">{label}</span>
      {children}
    </label>
  );
}
