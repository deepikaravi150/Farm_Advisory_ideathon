'use client';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Sprout, Leaf, Tractor, ChevronLeft, X } from 'lucide-react';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';

export interface AssessmentPayload {
  cropName?: string;
  info?: string;
  startDate?: string;
  assessment: Record<string, string>;
}

interface Props {
  onSubmit: (state: FarmerState, payload: AssessmentPayload) => void;
  loading: boolean;
  onClose?: () => void;
}

interface Question {
  key: string;
  type: 'single' | 'text' | 'crop';
  // Stable English option values — used for the dynamic `showIf` logic and sent
  // to the LLM, while the displayed labels come from translations (same order).
  values?: string[];
  optional?: boolean;
  showIf?: (a: Record<string, string>) => boolean;
}

// `showIf` makes the series dynamic: a farmer who has never grown anything on
// this land never sees the previous-crop questions.
const QUESTIONS: Question[] = [
  { key: 'cropName', type: 'crop' },
  { key: 'experience', type: 'single', values: ['New to farming', 'Less than 3 years', '3–10 years', 'More than 10 years'] },
  { key: 'grownBefore', type: 'single', values: ['Yes', 'No'] },
  { key: 'previousCrops', type: 'text', showIf: a => a.grownBefore === 'Yes' },
  { key: 'lastGrownWhen', type: 'text', showIf: a => a.grownBefore === 'Yes' },
  { key: 'lastHarvest', type: 'single', values: ['Good', 'Average', 'Poor'], showIf: a => a.grownBefore === 'Yes' },
  { key: 'pastIssues', type: 'text', optional: true, showIf: a => a.grownBefore === 'Yes' },
  { key: 'irrigation', type: 'single', values: ['Rain-fed only', 'Borewell', 'Canal', 'Open well / pond', 'Drip / sprinkler'] },
  { key: 'fertilizers', type: 'single', values: ['None', 'Chemical', 'Organic', 'Both chemical & organic'] },
];

export default function StateAssessmentModal({ onSubmit, loading, onClose }: Props) {
  const t = useTranslations('assessment');
  const tc = useTranslations('common');
  const [phase, setPhase] = useState<'state' | 'questions' | 'final'>('state');
  const [state, setState] = useState<FarmerState>('planning_unsure');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [cropName, setCropName] = useState('');
  const [info, setInfo] = useState('');
  const today = new Date().toISOString().split('T')[0];
  const [startDate, setStartDate] = useState(today);

  const visible = useMemo(
    () => QUESTIONS.filter(q => !q.showIf || q.showIf(answers)),
    [answers]
  );
  const current = visible[idx];

  function chooseState(s: FarmerState) {
    setState(s);
    setAnswers({});
    setCropName('');
    setIdx(0);
    setPhase('questions');
  }

  function setAnswer(key: string, value: string) {
    if (key === 'cropName') setCropName(value);
    setAnswers(prev => ({ ...prev, [key]: value }));
  }

  function acceptCropAndAdvance() {
    const accepted = cropName.trim();
    if (!accepted) return;
    setAnswer('cropName', accepted);
    advance();
  }

  function advance() {
    if (idx + 1 >= visible.length) setPhase('final');
    else setIdx(idx + 1);
  }

  function back() {
    if (idx === 0) { setPhase('state'); return; }
    setIdx(idx - 1);
  }

  function buildAssessment(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of visible) {
      const v = answers[q.key];
      if (v && v.trim()) out[q.key] = v.trim();
    }
    return out;
  }

  function submitFinal() {
    const assessment = buildAssessment();
    if (state === 'planning_specific') onSubmit(state, { cropName, startDate, assessment });
    else if (state === 'mid_grow') onSubmit(state, { cropName, info, assessment });
    else onSubmit(state, { cropName, startDate, assessment });
  }

  const total = visible.length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 relative">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            title={tc('close')}
            className="absolute right-4 top-4 text-gray-400 hover:text-gray-700 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        )}
        <h2 className="text-xl font-bold text-gray-800 mb-2 pr-8">{t('title')}</h2>
        <p className="text-gray-500 text-sm mb-6">
          {phase === 'state' ? t('subtitleState') : t('subtitleQuestions')}
        </p>

        {/* Step 1 — situation */}
        {phase === 'state' && (
          <div className="space-y-3">
            {[
              { value: 'planning_unsure', icon: Sprout, label: t('optUnsureLabel'), desc: t('optUnsureDesc') },
              { value: 'planning_specific', icon: Leaf, label: t('optSpecificLabel'), desc: t('optSpecificDesc') },
              { value: 'mid_grow', icon: Tractor, label: t('optMidLabel'), desc: t('optMidDesc') },
            ].map(opt => (
              <button key={opt.value} onClick={() => chooseState(opt.value as FarmerState)}
                disabled={loading}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-brand-400 hover:bg-brand-50 transition-all text-left">
                <div className="bg-brand-100 p-2 rounded-lg"><opt.icon className="w-5 h-5 text-brand-700" /></div>
                <div>
                  <p className="font-medium text-gray-800">{opt.label}</p>
                  <p className="text-sm text-gray-500">{opt.desc}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Step 2 — dynamic questionnaire */}
        {phase === 'questions' && current && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <button onClick={back} className="flex items-center gap-1 hover:text-gray-600">
                <ChevronLeft className="w-3.5 h-3.5" /> {tc('back')}
              </button>
              <span>{t('questionOf', { current: idx + 1, total })}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-brand-500 transition-all" style={{ width: `${((idx + 1) / total) * 100}%` }} />
            </div>

            <p className="font-medium text-gray-800">
              {current.type === 'crop' ? t('finalCropLabel') : t(`${current.key}.q`)}
            </p>

            {current.type === 'single' && (
              <div className="space-y-2">
                {current.values!.map((val, i) => {
                  const labels = t.raw(`${current.key}.opts`) as string[];
                  return (
                    <button key={val}
                      onClick={() => { setAnswer(current.key, val); advance(); }}
                      className={`w-full text-left px-4 py-2.5 rounded-xl border-2 transition-all ${
                        answers[current.key] === val
                          ? 'border-brand-500 bg-brand-50 text-brand-700'
                          : 'border-gray-200 hover:border-brand-300'
                      }`}>
                      {labels?.[i] ?? val}
                    </button>
                  );
                })}
              </div>
            )}

            {current.type === 'crop' && (
              <div className="space-y-3">
                <input
                  autoFocus
                  value={cropName}
                  onChange={e => setAnswer(current.key, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      acceptCropAndAdvance();
                    }
                  }}
                  placeholder={t('finalCropPlaceholder')}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white"
                />
                <button onClick={acceptCropAndAdvance}
                  disabled={!cropName.trim()}
                  className="w-full bg-brand-600 text-white py-2.5 rounded-xl hover:bg-brand-700 disabled:opacity-40">
                  {tc('next')}
                </button>
              </div>
            )}

            {current.type === 'text' && (
              <div className="space-y-3">
                <input
                  autoFocus
                  value={answers[current.key] ?? ''}
                  onChange={e => setAnswer(current.key, e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && (current.optional || (answers[current.key] ?? '').trim())) {
                      e.preventDefault();
                      advance();
                    }
                  }}
                  placeholder={t(`${current.key}.ph`)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
                <button onClick={advance}
                  disabled={!current.optional && !(answers[current.key] ?? '').trim()}
                  className="w-full bg-brand-600 text-white py-2.5 rounded-xl hover:bg-brand-700 disabled:opacity-40">
                  {current.optional && !(answers[current.key] ?? '').trim() ? tc('skip') : tc('next')}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 3 — situation-specific final input + submit */}
        {phase === 'final' && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (
                !loading &&
                cropName.trim() &&
                (state !== 'mid_grow' || info.trim())
              ) {
                submitFinal();
              }
            }}
            className="space-y-4"
          >
            <button type="button" onClick={() => { setIdx(visible.length - 1); setPhase('questions'); }}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <ChevronLeft className="w-3.5 h-3.5" /> {tc('back')}
            </button>

            {state === 'mid_grow' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('finalMidLabel')}</label>
                <textarea value={info} onChange={e => setInfo(e.target.value)} rows={3}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400 resize-none"
                  placeholder={t('finalMidPlaceholder')} />
              </div>
            )}

            {state === 'planning_unsure' && (
              <p className="text-sm text-gray-600 bg-brand-50 border border-brand-100 rounded-xl p-3">
                {t('finalUnsureMsg')}
              </p>
            )}

            {/* Planting start date — anchors the whole plan's schedule. */}
            {state !== 'mid_grow' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('startDateLabel')}</label>
                <input type="date" value={startDate} min={today}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-brand-400" />
                <p className="text-xs text-gray-400 mt-1">{t('startDateHint')}</p>
              </div>
            )}

            <button type="submit"
              disabled={
                loading ||
                !cropName.trim() ||
                (state === 'mid_grow' && !info.trim())
              }
              className="w-full bg-brand-600 text-white py-3 rounded-xl hover:bg-brand-700 disabled:opacity-40 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save New Plan
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
