'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import StateAssessmentModal, { type AssessmentPayload } from '@/components/crop-plan/StateAssessmentModal';
import CropSuggestions from '@/components/crop-plan/CropSuggestions';
import PlanTimeline from '@/components/crop-plan/PlanTimeline';
import PlanChatPanel from '@/components/crop-plan/PlanChatPanel';
import { Loader2, RefreshCw, Leaf, Save, Trash2 } from 'lucide-react';
import type { CropPlan, SuggestedCrop } from '@/lib/types/crop-plan';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';
type SavedPlan = CropPlan & { planId: string; createdAt?: string; inputDetails?: Record<string, unknown> };

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
    createdAt: typeof p.created_at === 'string' ? p.created_at : undefined,
    inputDetails: (p.input_details ?? {}) as Record<string, unknown>,
  };
}

function upsertSavedPlan(plans: SavedPlan[], plan: SavedPlan) {
  return [plan, ...plans.filter(existing => existing.planId !== plan.planId)];
}

export default function CropPlanPage() {
  const t = useTranslations('cropPlan');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedCrop[]>([]);
  const [activePlan, setActivePlan] = useState<CropPlan | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingInputDetails, setPendingInputDetails] = useState<Record<string, unknown> | null>(null);
  const [planError, setPlanError] = useState('');

  useEffect(() => {
    refreshPlans().catch(() => setShowModal(true))
      .finally(() => setInitialLoading(false));
  }, []);

  async function refreshPlans() {
    const res = await fetch('/api/crop-plan', { cache: 'no-store' });
    const plans = await res.json();
    if (Array.isArray(plans) && plans.length > 0) {
      const normalized = plans.map(toSavedPlan);
      setSavedPlans(normalized);
      setActivePlan(prev => {
        if (!prev) return normalized[0];
        return normalized.find(plan =>
          ('planId' in prev && plan.planId === prev.planId) ||
          (plan.cropName === prev.cropName && plan.startDate === prev.startDate)
        ) ?? normalized[0];
      });
    } else {
      setSavedPlans([]);
      setActivePlan(null);
      setShowModal(true);
    }
  }

  async function deletePlan(planId: string) {
    try {
      await fetch(`/api/crop-plan?planId=${encodeURIComponent(planId)}`, { method: 'DELETE' });
      await refreshPlans();
    } catch {
      /* keep current list if delete fails */
    }
  }

  async function onAssessmentSubmit(state: FarmerState, payload: AssessmentPayload) {
    setLoading(true);
    setShowModal(false);
    setSuggestions([]);
    setPlanError('');
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
      const p = data.planData?.plan ?? data.planData;
      const saved = data.planData?.savedPlan ? toSavedPlan(data.planData.savedPlan) : null;
      if (saved) {
        setSavedPlans(prev => upsertSavedPlan(prev, saved));
        setActivePlan(saved);
        setPendingInputDetails(null);
        await refreshPlans();
      } else if (p?.cropName) {
        const inputDetails = (data.planData?.inputDetails ?? {
          farmerState: state,
          selectedCrop: payload.cropName,
          currentCropInfo: payload.info ?? '',
          assessment: payload.assessment,
          startDate: payload.startDate,
        }) as Record<string, unknown>;
        const savedFallback = await savePlan(p, inputDetails);
        if (savedFallback) {
          setActivePlan(savedFallback);
          await refreshPlans();
        } else {
          setActivePlan(p);
          setPendingInputDetails(inputDetails);
          setPlanError('Plan was created, but saving failed. Click Save to Saved Plans to try again.');
        }
      } else {
        setPlanError('Plan was not created. Please try again.');
      }
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Plan save failed. Please try again.');
    }
    finally { setLoading(false); }
  }

  // Persist a crop the farmer picked from the AI suggestions so it shows up on
  // their next visit.
  async function selectSuggestedCrop(crop: SuggestedCrop) {
    setActivePlan(crop);
    setSuggestions([]);
    const saved = await savePlan(crop);
    if (saved) setActivePlan(saved);
  }

  // Apply a plan change the farmer confirmed from the chat panel, and persist it.
  async function applyPlanChange(updated: CropPlan) {
    setActivePlan(updated);
    const saved = await savePlan(updated);
    if (saved) setActivePlan(saved);
  }

  async function savePlan(plan: CropPlan, inputDetails?: Record<string, unknown> | null): Promise<SavedPlan | null> {
    setSaving(true);
    setPlanError('');
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', plan, inputDetails: inputDetails ?? undefined }),
      });
      if (!res.ok) throw new Error('Plan save failed');
      const data = await res.json();
      const saved = data.savedPlan ? toSavedPlan(data.savedPlan) : null;
      if (saved) {
        setSavedPlans(prev => upsertSavedPlan(prev, saved));
        setPendingInputDetails(null);
      }
      return saved;
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Plan save failed. Please try again.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  if (initialLoading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 className="w-8 h-8 animate-spin text-brand-600" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Leaf className="w-6 h-6 text-brand-600" />{t('title')}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{t('subtitle')}</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 border border-brand-300 rounded-xl px-4 py-2">
            <RefreshCw className="w-4 h-4" /> {t('newPlan')}
          </button>
        </div>

        {planError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {planError}
          </div>
        )}

        {(savedPlans.length > 0 || activePlan) && (
          <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-6">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-800">Saved Plans</h2>
              {activePlan && (
                <button
                  onClick={async () => {
                    const saved = await savePlan(activePlan, pendingInputDetails);
                    if (saved) {
                      setActivePlan(saved);
                      await refreshPlans();
                    }
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs bg-brand-600 text-white rounded-lg px-3 py-1.5 hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  Save
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {savedPlans.map((plan) => {
                const selected = activePlan && 'planId' in activePlan
                  ? activePlan.planId === plan.planId
                  : activePlan?.cropName === plan.cropName && activePlan?.startDate === plan.startDate;
                return (
                  <div
                    key={plan.planId}
                    className={`group relative min-w-[220px] text-left border rounded-lg px-3 py-2 transition-colors ${
                      selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    <button type="button" onClick={() => setActivePlan(plan)} className="w-full text-left pr-7">
                      <p className="text-sm font-semibold text-gray-800 truncate">{plan.cropName}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{plan.startDate ?? 'No start date'}</p>
                      <div className="max-h-0 overflow-hidden transition-all duration-200 group-hover:max-h-32">
                        <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 text-xs text-gray-600">
                          <p>{plan.milestones.length} stages</p>
                          <p>Budget: Rs.{plan.totalBudgetEstimate.toLocaleString('en-IN')}</p>
                          <p>Harvest: {plan.harvestDate || 'Not set'}</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deletePlan(plan.planId); }}
                      title="Delete plan"
                      className="absolute right-2 top-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-brand-600 mb-4" />
            <p className="text-brand-700 font-medium">{t('generatingTitle')}</p>
            <p className="text-sm text-gray-500 mt-1">{t('generatingSubtitle')}</p>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <CropSuggestions crops={suggestions} onSelect={selectSuggestedCrop} />
        )}

        {!loading && activePlan && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Selected Plan Details</h2>
              {pendingInputDetails && (
                <button
                  onClick={async () => {
                    const saved = await savePlan(activePlan, pendingInputDetails);
                    if (saved) {
                      setActivePlan(saved);
                      await refreshPlans();
                    }
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm bg-brand-600 text-white rounded-lg px-4 py-2 hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save to Saved Plans
                </button>
              )}
            </div>
            {pendingInputDetails && (
              <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                Unsaved new plan. Click Save to Saved Plans to store this plan and show it in Saved Plans.
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* Timeline */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow border border-gray-100 p-6">
              <PlanTimeline plan={activePlan} />
              {activePlan.storageNotes && (
                <div className="mt-4 bg-earth-50 rounded-xl p-4 border border-earth-200">
                  <p className="text-sm font-medium text-earth-700 mb-1">{t('storageNotesTitle')}</p>
                  <p className="text-sm text-earth-600">{activePlan.storageNotes}</p>
                </div>
              )}
            </div>
            {/* Plan chatbot — interact with and edit the plan */}
            <div className="lg:col-span-1 lg:sticky lg:top-6 h-[600px]">
              <PlanChatPanel plan={activePlan} onApply={applyPlanChange} />
            </div>
            </div>
          </div>
        )}

        {showModal && !loading && (
          <StateAssessmentModal onSubmit={onAssessmentSubmit} loading={loading} onClose={() => setShowModal(false)} />
        )}
      </div>
    </div>
  );
}
