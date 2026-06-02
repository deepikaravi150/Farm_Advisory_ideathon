'use client';
import { useTranslations } from 'next-intl';
import { IndianRupee, Leaf, CheckCircle2 } from 'lucide-react';
import type { SuggestedCrop } from '@/lib/types/crop-plan';

interface CropSuggestionsProps {
  crops: SuggestedCrop[];
  onSelect: (crop: SuggestedCrop) => void;
}

export default function CropSuggestions({ crops, onSelect }: CropSuggestionsProps) {
  const t = useTranslations('suggestions');
  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('title')}</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {crops.map((crop, i) => (
          <div key={crop.cropName}
            className="bg-white border-2 border-gray-200 rounded-2xl p-5 hover:border-brand-400 transition-colors flex flex-col">
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-brand-100 rounded-full w-8 h-8 flex items-center justify-center text-brand-700 font-bold text-sm">{i + 1}</div>
              <h4 className="font-bold text-gray-800 text-lg">{crop.cropName}</h4>
            </div>
            <p className="text-sm text-gray-600 mb-3 flex-1">{crop.reason}</p>
            <div className="space-y-1.5 mb-4 text-sm">
              <div className="flex items-center gap-2">
                <Leaf className="w-3.5 h-3.5 text-brand-600" />
                <span className="text-gray-600">{t('season')}: <span className="font-medium">{crop.season}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <IndianRupee className="w-3.5 h-3.5 text-earth-600" />
                <span className="text-gray-600">{t('revenueEst')}: <span className="font-medium text-earth-700">{crop.estimatedRevenue}</span></span>
              </div>
              <div className="flex items-center gap-2">
                <IndianRupee className="w-3.5 h-3.5 text-red-500" />
                <span className="text-gray-600">{t('budget')}: <span className="font-medium">₹{crop.totalBudgetEstimate?.toLocaleString('en-IN')}</span></span>
              </div>
            </div>
            <button onClick={() => onSelect(crop)}
              className="w-full bg-brand-600 text-white py-2.5 rounded-xl hover:bg-brand-700 transition-colors flex items-center justify-center gap-2 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> {t('selectThis')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
