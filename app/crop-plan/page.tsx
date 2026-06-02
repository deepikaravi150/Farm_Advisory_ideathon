'use client';
import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import StateAssessmentModal, { type AssessmentPayload } from '@/components/crop-plan/StateAssessmentModal';
import CropSuggestions from '@/components/crop-plan/CropSuggestions';
import PlanTimeline from '@/components/crop-plan/PlanTimeline';
import PlanChatPanel from '@/components/crop-plan/PlanChatPanel';
import { Loader2, RefreshCw, Leaf } from 'lucide-react';
import type { CropPlan, SuggestedCrop } from '@/lib/types/crop-plan';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';

export default function CropPlanPage() {
  const t = useTranslations('cropPlan');
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [existingPlan, setExistingPlan] = useState<CropPlan | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestedCrop[]>([]);
  const [activePlan, setActivePlan] = useState<CropPlan | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    fetch('/api/crop-plan').then(r => r.json()).then(plans => {
      if (Array.isArray(plans) && plans.length > 0) {
        const p = plans[0];
        setActivePlan({ cropName: p.crop_name, startDate: p.start_date, milestones: p.milestones ?? [], totalBudgetEstimate: p.budget_estimate, harvestDate: p.harvest_date, sellWindow: p.sell_window, storageNotes: p.storage_notes });
      } else {
        setShowModal(true);
      }
    }).catch(() => setShowModal(true))
      .finally(() => setInitialLoading(false));
  }, []);

  async function onAssessmentSubmit(state: FarmerState, payload: AssessmentPayload) {
    setLoading(true);
    setShowModal(false);
    setSuggestions([]);
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
      if (state === 'planning_unsure') {
        setSuggestions(data.planData?.suggestedCrops ?? []);
      } else {
        const p = data.planData?.plan ?? data.planData;
        if (p?.cropName) setActivePlan(p);
      }
    } catch { /* error handled by empty state */ }
    finally { setLoading(false); }
  }

  // Persist a crop the farmer picked from the AI suggestions so it shows up on
  // their next visit.
  async function selectSuggestedCrop(crop: SuggestedCrop) {
    setActivePlan(crop);
    setSuggestions([]);
    await savePlan(crop);
  }

  // Apply a plan change the farmer confirmed from the chat panel, and persist it.
  async function applyPlanChange(updated: CropPlan) {
    setActivePlan(updated);
    await savePlan(updated);
  }

  async function savePlan(plan: CropPlan) {
    try {
      await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', plan }),
      });
    } catch { /* non-blocking — plan is already shown */ }
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
        )}

        {showModal && !loading && (
          <StateAssessmentModal onSubmit={onAssessmentSubmit} loading={loading} />
        )}
      </div>
    </div>
  );
}
