'use client';
import { useState, useEffect } from 'react';
import Navbar from '@/components/layout/Navbar';
import StateAssessmentModal from '@/components/crop-plan/StateAssessmentModal';
import CropSuggestions from '@/components/crop-plan/CropSuggestions';
import PlanFlowChart from '@/components/crop-plan/PlanFlowChart';
import { Loader2, RefreshCw, Leaf } from 'lucide-react';
import type { CropPlan, SuggestedCrop } from '@/lib/types/crop-plan';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';

export default function CropPlanPage() {
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
        setActivePlan({ cropName: p.crop_name, milestones: p.milestones ?? [], totalBudgetEstimate: p.budget_estimate, harvestDate: p.harvest_date, sellWindow: p.sell_window, storageNotes: p.storage_notes });
      } else {
        setShowModal(true);
      }
    }).catch(() => setShowModal(true))
      .finally(() => setInitialLoading(false));
  }, []);

  async function onAssessmentSubmit(state: FarmerState, cropName?: string, info?: string) {
    setLoading(true);
    setShowModal(false);
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ farmerState: state, cropName, currentCropInfo: info }),
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

  function selectSuggestedCrop(crop: SuggestedCrop) {
    setActivePlan(crop);
    setSuggestions([]);
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
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2"><Leaf className="w-6 h-6 text-brand-600" />Crop Plan</h1>
            <p className="text-sm text-gray-500 mt-0.5">Your AI-generated seasonal farming roadmap</p>
          </div>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 text-sm text-brand-600 hover:text-brand-800 border border-brand-300 rounded-xl px-4 py-2">
            <RefreshCw className="w-4 h-4" /> New Plan
          </button>
        </div>

        {loading && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-brand-600 mb-4" />
            <p className="text-brand-700 font-medium">Generating your personalized crop plan...</p>
            <p className="text-sm text-gray-500 mt-1">Analyzing your land, soil data, and seasonal conditions</p>
          </div>
        )}

        {!loading && suggestions.length > 0 && (
          <CropSuggestions crops={suggestions} onSelect={selectSuggestedCrop} />
        )}

        {!loading && activePlan && (
          <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
            <PlanFlowChart
              milestones={activePlan.milestones}
              cropName={activePlan.cropName}
              totalBudget={activePlan.totalBudgetEstimate}
              harvestDate={activePlan.harvestDate}
              sellWindow={activePlan.sellWindow}
            />
            {activePlan.storageNotes && (
              <div className="mt-4 bg-earth-50 rounded-xl p-4 border border-earth-200">
                <p className="text-sm font-medium text-earth-700 mb-1">Storage & Selling Notes</p>
                <p className="text-sm text-earth-600">{activePlan.storageNotes}</p>
              </div>
            )}
          </div>
        )}

        {showModal && !loading && (
          <StateAssessmentModal onSubmit={onAssessmentSubmit} loading={loading} />
        )}
      </div>
    </div>
  );
}
