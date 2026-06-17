'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { Leaf, Plus, Loader2, Trash2, CheckCircle2, Coins, Scissors, MessageSquarePlus, ChevronDown } from 'lucide-react';
import StateAssessmentModal, { type AssessmentPayload } from '@/components/crop-plan/StateAssessmentModal';
import CropSuggestions from '@/components/crop-plan/CropSuggestions';
import PlanChatPanel from '@/components/crop-plan/PlanChatPanel';
import StageAccordion from '@/components/plan/StageAccordion';
import LanguageSwitcher from '@/components/layout/LanguageSwitcher';
import type { CropPlan, SuggestedCrop } from '@/lib/types/crop-plan';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';
type SavedPlan = CropPlan & { planId: string; status?: string; activeFrom?: string; inputDetails?: Record<string, unknown> };

function toSavedPlan(p: Record<string, unknown>): SavedPlan {
  return {
    planId: String(p.plan_id ?? p.created_at ?? p.crop_name ?? Math.random()),
    cropName: String(p.crop_name ?? ''),
    startDate: typeof p.start_date === 'string' ? p.start_date : undefined,
    milestones: (p.milestones ?? []) as CropPlan['milestones'],
    totalBudgetEstimate: Number(p.budget_estimate ?? 0),
    harvestDate: String(p.harvest_date ?? ''),
    sellWindow: String(p.sell_window ?? ''),
    storageNotes: String(p.storage_notes ?? ''),
    status: typeof p.status === 'string' ? p.status : 'planned',
    activeFrom: typeof p.active_from === 'string' ? p.active_from : undefined,
    inputDetails: (p.input_details ?? {}) as Record<string, unknown>,
  };
}

function upsert(plans: SavedPlan[], plan: SavedPlan) {
  return [plan, ...plans.filter((p) => p.planId !== plan.planId)];
}

export default function PlanPage() {
  const locale = useLocale() as 'en' | 'hi' | 'ta';
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [activePlan, setActivePlan] = useState<SavedPlan | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedCrop[]>([]);
  const [suggestionContext, setSuggestionContext] = useState<{ assessment?: Record<string, string>; startDate?: string } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);

  useEffect(() => {
    refreshPlans().catch(() => setShowModal(true)).finally(() => setInitialLoading(false));
  }, []);

  async function refreshPlans() {
    const res = await fetch('/api/crop-plan', { cache: 'no-store' });
    const plans = await res.json();
    if (Array.isArray(plans) && plans.length > 0) {
      const normalized = plans.map(toSavedPlan);
      setSavedPlans(normalized);
      setActivePlan((prev) =>
        prev ? normalized.find((p) => p.planId === prev.planId) ?? normalized[0] : normalized[0],
      );
    } else {
      setSavedPlans([]);
      setActivePlan(null);
    }
  }

  async function applyGeneratedPlan(data: { planData?: { plan?: CropPlan; savedPlan?: Record<string, unknown> } }) {
    const saved = data.planData?.savedPlan ? toSavedPlan(data.planData.savedPlan) : null;
    if (saved) {
      setSavedPlans((prev) => upsert(prev, saved));
      setActivePlan(saved);
      await refreshPlans();
      return;
    }
    setError('Plan was not created. Please try again.');
  }

  async function onAssessmentSubmit(state: FarmerState, payload: AssessmentPayload) {
    setLoading(true);
    setShowModal(false);
    setSuggestions([]);
    setSuggestionContext(null);
    setError('');
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmerState: state,
          cropName: payload.cropName,
          currentCropInfo: payload.info,
          startDate: payload.startDate,
          assessment: payload.assessment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Plan generation failed');

      const suggested = data.planData?.suggestedCrops;
      if (Array.isArray(suggested) && suggested.length) {
        setSuggestions(suggested);
        setSuggestionContext({ assessment: payload.assessment, startDate: payload.startDate });
        return;
      }
      await applyGeneratedPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function selectSuggestedCrop(crop: SuggestedCrop) {
    setSuggestions([]);
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          farmerState: 'planning_specific',
          cropName: crop.cropName,
          startDate: suggestionContext?.startDate,
          assessment: suggestionContext?.assessment,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Plan generation failed');
      await applyGeneratedPlan(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Plan generation failed. Please try again.');
    } finally {
      setLoading(false);
      setSuggestionContext(null);
    }
  }

  async function planAction(action: 'activate' | 'deactivate', planId: string) {
    setSaving(true);
    try {
      await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, planId }),
      });
      await refreshPlans();
    } catch { /* keep state */ } finally { setSaving(false); }
  }

  async function deletePlan(planId: string) {
    try {
      await fetch(`/api/crop-plan?planId=${encodeURIComponent(planId)}`, { method: 'DELETE' });
      await refreshPlans();
    } catch { /* ignore */ }
  }

  async function applyPlanChange(updated: CropPlan) {
    const planId = activePlan?.planId;
    setActivePlan((prev) => (prev ? { ...prev, ...updated } : prev));
    setSaving(true);
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', plan: updated, inputDetails: activePlan?.inputDetails, planId }),
      });
      const data = await res.json();
      if (data.savedPlan) {
        const saved = toSavedPlan(data.savedPlan);
        setSavedPlans((prev) => upsert(prev, saved));
        setActivePlan(saved);
      }
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  if (initialLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="px-4 pb-28 pt-5">
      <div className="mb-4 flex items-start justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900">
            <Leaf className="h-5 w-5 text-brand-600" /> Crop Plan
          </h1>
          <p className="text-sm text-gray-500">Your season, stage by stage.</p>
        </div>
        <LanguageSwitcher />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {/* Saved plan chips */}
      {savedPlans.length > 0 && (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {savedPlans.map((plan) => {
            const selected = activePlan?.planId === plan.planId;
            return (
              <button
                key={plan.planId}
                onClick={() => setActivePlan(plan)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  selected ? 'border-brand-500 bg-brand-600 text-white' : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {plan.cropName}
                {plan.status === 'active' && <span className="ml-1.5">●</span>}
              </button>
            );
          })}
          <button
            onClick={() => setShowModal(true)}
            className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700"
          >
            <Plus className="h-4 w-4" /> New
          </button>
        </div>
      )}

      {/* Generating */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Loader2 className="mb-3 h-9 w-9 animate-spin text-brand-600" />
          <p className="font-medium text-brand-700">Generating your crop plan…</p>
          <p className="mt-1 text-sm text-gray-500">Analyzing your land, soil and season.</p>
        </div>
      )}

      {/* Suggestions */}
      {!loading && suggestions.length > 0 && (
        <div className="mb-6">
          <CropSuggestions crops={suggestions} onSelect={selectSuggestedCrop} />
        </div>
      )}

      {/* Empty state */}
      {!loading && !activePlan && suggestions.length === 0 && (
        <div className="rounded-2xl border border-dashed border-brand-300 bg-white p-8 text-center">
          <Leaf className="mx-auto h-9 w-9 text-brand-500" />
          <h2 className="mt-2 font-semibold text-gray-900">No crop plan yet</h2>
          <p className="mt-1 text-sm text-gray-500">Answer a few questions and AI will build your season plan.</p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-4 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Build my crop plan
          </button>
        </div>
      )}

      {/* Active plan */}
      {!loading && activePlan && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">{activePlan.cropName}</h2>
              {activePlan.status === 'active' ? (
                <span className="flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Active
                </span>
              ) : (
                <button
                  onClick={() => planAction('activate', activePlan.planId)}
                  disabled={saving}
                  className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold hover:bg-white/30"
                >
                  Make active
                </button>
              )}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-xl bg-white/10 p-2">
                <div className="flex items-center justify-center gap-1 font-semibold"><Coins className="h-3.5 w-3.5" />Budget</div>
                <div className="mt-0.5 text-sm font-bold">₹{activePlan.totalBudgetEstimate.toLocaleString('en-IN')}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-2">
                <div className="font-semibold">Stages</div>
                <div className="mt-0.5 text-sm font-bold">{activePlan.milestones.length}</div>
              </div>
              <div className="rounded-xl bg-white/10 p-2">
                <div className="flex items-center justify-center gap-1 font-semibold"><Scissors className="h-3.5 w-3.5" />Harvest</div>
                <div className="mt-0.5 text-[11px] font-semibold">{activePlan.harvestDate || '—'}</div>
              </div>
            </div>
          </div>

          {/* Stages */}
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-400">Stages — tap to expand</h3>
            <StageAccordion milestones={activePlan.milestones} locale={locale} />
          </div>

          {/* Sell window / storage */}
          {(activePlan.sellWindow || activePlan.storageNotes) && (
            <div className="rounded-2xl bg-white p-4 text-sm text-gray-700 shadow-sm">
              {activePlan.sellWindow && <p><span className="font-semibold">Sell window:</span> {activePlan.sellWindow}</p>}
              {activePlan.storageNotes && <p className="mt-1"><span className="font-semibold">Storage:</span> {activePlan.storageNotes}</p>}
            </div>
          )}

          {/* Adjust plan via chat */}
          <div className="rounded-2xl bg-white shadow-sm">
            <button
              onClick={() => setShowAdjust((v) => !v)}
              className="flex w-full items-center justify-between p-4 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                <MessageSquarePlus className="h-4 w-4 text-brand-600" /> Ask or change this plan
              </span>
              <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showAdjust ? 'rotate-180' : ''}`} />
            </button>
            {showAdjust && (
              <div className="border-t border-gray-100 p-3">
                <PlanChatPanel plan={activePlan} onApply={applyPlanChange} />
              </div>
            )}
          </div>

          {/* Manage */}
          <div className="flex items-center justify-between pt-1">
            {activePlan.status === 'active' ? (
              <button onClick={() => planAction('deactivate', activePlan.planId)} disabled={saving}
                className="text-sm font-medium text-amber-700">Make inactive</button>
            ) : <span />}
            <button onClick={() => deletePlan(activePlan.planId)}
              className="flex items-center gap-1 text-sm font-medium text-red-500">
              <Trash2 className="h-4 w-4" /> Delete plan
            </button>
          </div>
        </div>
      )}

      {showModal && <StateAssessmentModal onSubmit={onAssessmentSubmit} loading={loading} onClose={() => setShowModal(false)} />}
    </div>
  );
}
