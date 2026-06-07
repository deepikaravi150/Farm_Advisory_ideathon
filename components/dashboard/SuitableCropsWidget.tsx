'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Sprout, Loader2 } from 'lucide-react';

interface CropSuitability {
  cropName: string;
  score: number;
  reason: string;
  soilFit: 'good' | 'conditional' | 'poor';
}

interface CropOptionsResponse {
  district?: string | null;
  crops?: CropSuitability[];
}

const CROP_LABELS: Record<string, { hi: string; ta: string }> = {
  Paddy: { hi: 'धान', ta: 'நெல்' },
  Sugarcane: { hi: 'गन्ना', ta: 'கரும்பு' },
  Groundnut: { hi: 'मूंगफली', ta: 'நிலக்கடலை' },
  Millets: { hi: 'बाजरा/मिलेट', ta: 'சிறுதானியங்கள்' },
  'Black gram': { hi: 'उड़द', ta: 'உளுந்து' },
  'Green gram': { hi: 'मूंग', ta: 'பச்சைப்பயறு' },
  Sesame: { hi: 'तिल', ta: 'எள்' },
  Banana: { hi: 'केला', ta: 'வாழை' },
  Tomato: { hi: 'टमाटर', ta: 'தக்காளி' },
  Brinjal: { hi: 'बैंगन', ta: 'கத்தரிக்காய்' },
  Chilli: { hi: 'मिर्च', ta: 'மிளகாய்' },
  Maize: { hi: 'मक्का', ta: 'மக்காச்சோளம்' },
  Cotton: { hi: 'कपास', ta: 'பருத்தி' },
  Turmeric: { hi: 'हल्दी', ta: 'மஞ்சள்' },
};

const DISTRICT_LABELS: Record<string, { hi: string; ta: string }> = {
  thiruvannamalai: { hi: 'तिरुवन्नामलाई', ta: 'திருவண்ணாமலை' },
  tiruvannamalai: { hi: 'तिरुवन्नामलाई', ta: 'திருவண்ணாமலை' },
  thanjavur: { hi: 'तंजावुर', ta: 'தஞ்சாவூர்' },
  tiruchirappalli: { hi: 'तिरुचिरापल्ली', ta: 'திருச்சிராப்பள்ளி' },
  madurai: { hi: 'मदुरै', ta: 'மதுரை' },
  erode: { hi: 'ईरोड', ta: 'ஈரோடு' },
  coimbatore: { hi: 'कोयंबटूर', ta: 'கோயம்புத்தூர்' },
  salem: { hi: 'सेलम', ta: 'சேலம்' },
  villupuram: { hi: 'विल्लुपुरम', ta: 'விழுப்புரம்' },
  cuddalore: { hi: 'कडलूर', ta: 'கடலூர்' },
};

export default function SuitableCropsWidget() {
  const locale = useLocale();
  const [data, setData] = useState<CropOptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const labelForCrop = (cropName: string) => {
    if (locale === 'en') return cropName;
    return CROP_LABELS[cropName]?.[locale as 'hi' | 'ta'] ?? cropName;
  };
  const labelForDistrict = (district?: string | null) => {
    if (!district || locale === 'en') return district ?? '';
    return DISTRICT_LABELS[district.toLowerCase()]?.[locale as 'hi' | 'ta'] ?? district;
  };
  const labelForFit = (fit: CropSuitability['soilFit']) => {
    if (fit === 'good') return t('good', 'अच्छा', 'நன்று');
    if (fit === 'conditional') return t('conditional', 'शर्तों के साथ', 'நிபந்தனையுடன்');
    return t('poor', 'कम उपयुक्त', 'குறைவு');
  };
  const labelForReason = (reason: string) => {
    if (locale === 'en') return reason;
    return reason
      .split('; ')
      .map((part) => {
        const phMatch = part.match(/^pH ([\d.]+)/);
        if (phMatch && part.includes('fits')) return t(`pH ${phMatch[1]} fits`, `pH ${phMatch[1]} उपयुक्त है`, `pH ${phMatch[1]} பொருந்துகிறது`);
        if (phMatch && part.includes('needs correction')) return t(`pH ${phMatch[1]} needs correction`, `pH ${phMatch[1]} सुधार चाहिए`, `pH ${phMatch[1]} திருத்தம் தேவை`);
        if (phMatch && part.includes('outside ideal range')) return t(`pH ${phMatch[1]} is outside ideal range`, `pH ${phMatch[1]} आदर्श सीमा से बाहर है`, `pH ${phMatch[1]} சிறந்த வரம்புக்கு வெளியே உள்ளது`);
        if (part === 'pulse crop can improve nitrogen') return t(part, 'दलहनी फसल नाइट्रोजन सुधार सकती है', 'பயறு வகை பயிர் நைட்ரஜனை மேம்படுத்தும்');
        if (part === 'nitrogen correction needed') return t(part, 'नाइट्रोजन सुधार जरूरी', 'நைட்ரஜன் திருத்தம் தேவை');
        if (part === 'phosphorus correction needed') return t(part, 'फॉस्फोरस सुधार जरूरी', 'பாஸ்பரஸ் திருத்தம் தேவை');
        if (part === 'potassium correction needed') return t(part, 'पोटैशियम सुधार जरूरी', 'பொட்டாசியம் திருத்தம் தேவை');
        if (part === 'No soil report yet') return t(part, 'अभी मिट्टी रिपोर्ट नहीं है', 'இன்னும் மண் அறிக்கை இல்லை');
        if (part === 'Matches local crop pattern') return t(part, 'स्थानीय फसल पैटर्न से मेल खाता है', 'உள்ளூர் பயிர் முறைக்கு பொருந்துகிறது');
        return part;
      })
      .join('; ');
  };

  useEffect(() => {
    fetch('/api/crop-options', { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('crop options unavailable')))
      .then(setData)
      .catch(() => setData({ crops: [] }))
      .finally(() => setLoading(false));
  }, []);

  const crops = data?.crops ?? [];
  const badge = (fit: CropSuitability['soilFit']) => {
    if (fit === 'good') return 'bg-emerald-100 text-emerald-700';
    if (fit === 'conditional') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <Sprout className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Suitable crops for your farm', 'आपके खेत के लिए उपयुक्त फसलें', 'உங்கள் பண்ணைக்கு ஏற்ற பயிர்கள்')}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('Checking crops...', 'फसलें जांच रहे हैं...', 'பயிர்கள் சரிபார்க்கப்படுகிறது...')}</span>
          </div>
        ) : crops.length ? (
          <div className="space-y-2">
            {data?.district && (
              <p className="text-xs text-gray-500">
                {t('Based on farm district and soil report', 'खेत के जिले और मिट्टी रिपोर्ट के आधार पर', 'பண்ணை மாவட்டம் மற்றும் மண் அறிக்கையின் அடிப்படையில்')}: {labelForDistrict(data.district)}
              </p>
            )}
            {crops.slice(0, 4).map((crop) => (
              <div key={crop.cropName} className="rounded-xl bg-gray-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-gray-800">{labelForCrop(crop.cropName)}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge(crop.soilFit)}`}>
                    {labelForFit(crop.soilFit)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{labelForReason(crop.reason)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-400">
            {t('Add farm address and soil report to see crop suggestions.', 'फसल सुझाव देखने के लिए खेत का पता और मिट्टी रिपोर्ट जोड़ें।', 'பயிர் பரிந்துரைகளைப் பார்க்க பண்ணை முகவரி மற்றும் மண் அறிக்கையைச் சேர்க்கவும்.')}
          </p>
        )}
      </div>
    </div>
  );
}
