'use client';
import { useState } from 'react';
import { Loader2, Sprout, Leaf, Tractor } from 'lucide-react';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';
interface Props { onSubmit: (state: FarmerState, cropName?: string, info?: string) => void; loading: boolean; }

export default function StateAssessmentModal({ onSubmit, loading }: Props) {
  const [step, setStep] = useState<'state' | 'crop' | 'midgrow'>('state');
  const [state, setState] = useState<FarmerState>('planning_unsure');
  const [cropName, setCropName] = useState('');
  const [info, setInfo] = useState('');

  function handleStateSelect(s: FarmerState) {
    setState(s);
    if (s === 'planning_unsure') { onSubmit(s); return; }
    if (s === 'planning_specific') { setStep('crop'); return; }
    setStep('midgrow');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-800 mb-2">Let's build your crop plan</h2>
        <p className="text-gray-500 text-sm mb-6">Tell me about your current farming situation.</p>

        {step === 'state' && (
          <div className="space-y-3">
            {[
              { value: 'planning_unsure', icon: Sprout, label: 'I\'m planning — not sure what to grow', desc: 'Get AI crop suggestions for your land' },
              { value: 'planning_specific', icon: Leaf, label: 'I have a crop in mind', desc: 'Validate and get a detailed plan' },
              { value: 'mid_grow', icon: Tractor, label: 'I\'m currently growing a crop', desc: 'Track progress and get remaining guidance' },
            ].map(opt => (
              <button key={opt.value} onClick={() => handleStateSelect(opt.value as FarmerState)}
                disabled={loading}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-all text-left">
                <div className="bg-brand-100 p-2 rounded-lg"><opt.icon className="w-5 h-5 text-brand-700" /></div>
                <div>
                  <p className="font-medium text-gray-800">{opt.label}</p>
                  <p className="text-sm text-gray-500">{opt.desc}</p>
                </div>
                {loading && <Loader2 className="w-4 h-4 animate-spin ml-auto text-brand-600" />}
              </button>
            ))}
          </div>
        )}

        {step === 'crop' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Which crop are you planning to grow?</label>
              <input value={cropName} onChange={e => setCropName(e.target.value)}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="e.g. Paddy, Tomato, Sugarcane..." />
            </div>
            <button onClick={() => onSubmit('planning_specific', cropName)} disabled={!cropName.trim() || loading}
              className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Generate Plan
            </button>
          </div>
        )}

        {step === 'midgrow' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tell me about your current crop</label>
              <textarea value={info} onChange={e => setInfo(e.target.value)} rows={3}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                placeholder="e.g. Growing paddy, sowed 3 weeks ago, looks healthy..." />
            </div>
            <button onClick={() => onSubmit('mid_grow', undefined, info)} disabled={!info.trim() || loading}
              className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />} Assess My Crop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
