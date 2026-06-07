'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { ListChecks, ArrowRight, Sprout, AlertTriangle, CalendarClock } from 'lucide-react';
import { nextStepFromPlan } from '@/lib/farm-advice';

export interface PlanItem {
  crop_name?: string;
  status?: string;
  milestones?: Array<{ label?: string; date?: string; endDate?: string; tasks?: string; alert?: boolean; alertAdvice?: string }>;
}

interface Props {
  plan?: PlanItem | null;
  plans?: PlanItem[];
}

type StepPayload = {
  cropName?: string;
  label?: string;
  tasks?: string;
  alertAdvice?: string;
};

export default function CropPlanNextStepWidget({ plan, plans = [] }: Props) {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const activePlans = plan ? [plan] : plans;
  const today = new Date().toISOString().split('T')[0];
  const dateLocale = locale === 'ta' ? 'ta-IN' : locale === 'hi' ? 'hi-IN' : 'en-IN';
  const fmt = (d?: string) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString(dateLocale, { day: 'numeric', month: 'short' }) : '');
  const items = activePlans.map((item) => ({ plan: item, step: nextStepFromPlan(item, today) }));
  const [translatedSteps, setTranslatedSteps] = useState<StepPayload[]>([]);
  const localizeText = (value?: string) => {
    if (!value || locale === 'en') return value;
    const replacements: Array<[RegExp, string, string]> = [
      [/\bChilli\b/g, 'मिर्च', 'மிளகாய்'],
      [/\bGreen Chilli\b/g, 'हरी मिर्च', 'பச்சை மிளகாய்'],
      [/\bBlack gram\b/g, 'उड़द', 'உளுந்து'],
      [/\bLand Preparation\b/g, 'भूमि तैयारी', 'நிலத் தயாரிப்பு'],
      [/\bSeed Selection and Treatment\b/g, 'बीज चयन और उपचार', 'விதை தேர்வு மற்றும் நேர்த்தி'],
      [/\bSowing\b/g, 'बुवाई', 'விதைப்பு'],
      [/\bIrrigation and Weed Control\b/g, 'सिंचाई और खरपतवार नियंत्रण', 'பாசனம் மற்றும் களை கட்டுப்பாடு'],
      [/\bNutrient and Pest Management\b/g, 'पोषक तत्व और कीट प्रबंधन', 'ஊட்டச்சத்து மற்றும் பூச்சி மேலாண்மை'],
      [/\bHarvesting and Selling\b/g, 'कटाई और बिक्री', 'அறுவடை மற்றும் விற்பனை'],
      [/Clear weeds and previous crop residues/gi, 'खरपतवार और पिछली फसल के अवशेष हटाएं', 'களைகள் மற்றும் முந்தைய பயிர் எச்சங்களை அகற்றவும்'],
      [/Deep plough and harrow to break clods/gi, 'ढेलों को तोड़ने के लिए गहरी जुताई और हैरो करें', 'கட்டிகளை உடைக்க ஆழமாக உழுது ஹாரோ செய்யவும்'],
      [/then level the field/gi, 'फिर खेत को समतल करें', 'பின்னர் வயலை சமப்படுத்தவும்'],
      [/Farm raised beds\/ridges and ensure strong channels to prevent waterlogging during June rains/gi, 'जून की बारिश में जलभराव रोकने के लिए मेड़/क्यारी और मजबूत नालियां बनाएं', 'ஜூன் மழையில் நீர்தேக்கம் தவிர்க்க உயர்ந்த படுக்கைகள்/மேடுகள் மற்றும் வலுவான வாய்க்கால்களை அமைக்கவும்'],
      [/Incorporate well-decomposed FYM\/compost/gi, 'अच्छी तरह सड़ी गोबर खाद/कम्पोस्ट मिलाएं', 'நன்றாக மக்கிய தொழு உரம்/கம்போஸ்ட் சேர்க்கவும்'],
      [/because organic carbon is low/gi, 'क्योंकि जैविक कार्बन कम है', 'ஏனெனில் கரிம கார்பன் குறைவாக உள்ளது'],
      [/mix thoroughly/gi, 'अच्छी तरह मिलाएं', 'நன்றாக கலக்கவும்'],
      [/If available, add green manure\/composted crop residues to improve soil structure/gi, 'यदि उपलब्ध हो तो मिट्टी की बनावट सुधारने के लिए हरी खाद/कम्पोस्ट फसल अवशेष डालें', 'இருந்தால் மண் அமைப்பை மேம்படுத்த பச்சை உரம்/கம்போஸ்ட் பயிர் எச்சங்களை சேர்க்கவும்'],
      [/Keep bunds strong to avoid runoff and soil erosion/gi, 'बहाव और मिट्टी कटाव रोकने के लिए मेड़ों को मजबूत रखें', 'நீரோட்டம் மற்றும் மண் அரிப்பை தவிர்க்க வரப்புகளை வலுவாக வைத்திருக்கவும்'],
      [/Clear weeds, plough the field, break clods, and level the land/gi, 'खरपतवार हटाएं, खेत की जुताई करें, ढेले तोड़ें और जमीन समतल करें', 'களைகளை அகற்றி, வயலை உழுது, கட்டிகளை உடைத்து நிலத்தை சமப்படுத்தவும்'],
      [/Add well-decomposed farmyard manure and improve drainage based on the field slope/gi, 'अच्छी तरह सड़ी गोबर खाद डालें और खेत की ढलान के अनुसार जल निकासी सुधारें', 'நன்றாக மக்கிய தொழு உரம் சேர்த்து, நில சரிவிற்கு ஏற்ப வடிகாலை மேம்படுத்தவும்'],
      [/No soil report is available, so confirm nutrient dose locally before applying fertilizer/gi, 'मिट्टी रिपोर्ट उपलब्ध नहीं है, इसलिए खाद डालने से पहले स्थानीय स्तर पर पोषक मात्रा की पुष्टि करें', 'மண் அறிக்கை இல்லை, எனவே உரம் இடுவதற்கு முன் உள்ளூரில் ஊட்டச்சத்து அளவை உறுதிப்படுத்தவும்'],
      [/Heavy rain\/storm forecast on/gi, 'इन तारीखों पर भारी बारिश/तूफान का पूर्वानुमान है:', 'இந்த தேதிகளில் கனமழை/புயல் முன்னறிவிப்பு உள்ளது:'],
      [/Avoid spraying or fertilizing on these days/gi, 'इन दिनों छिड़काव या खाद न डालें', 'இந்த நாட்களில் தெளிப்பு அல்லது உரமிடுதல் செய்ய வேண்டாம்'],
      [/ensure field drainage/gi, 'खेत की जल निकासी सुनिश्चित करें', 'வயல் வடிகாலை உறுதி செய்யவும்'],
      [/reschedule sowing\/harvesting around the wet spell if possible/gi, 'संभव हो तो बुवाई/कटाई को बारिश वाले दिनों से बचाकर रखें', 'முடிந்தால் விதைப்பு/அறுவடையை மழைக்காலத்தை தவிர்த்து மாற்றவும்'],
      [/\brain\b/gi, 'बारिश', 'மழை'],
      [/\bduring\b/gi, 'के दौरान', 'போது'],
      [/\bfield\b/gi, 'खेत', 'வயல்'],
      [/\bsoil\b/gi, 'मिट्टी', 'மண்'],
      [/\bcrop\b/gi, 'फसल', 'பயிர்'],
    ];
    return replacements.reduce((text, [pattern, hi, ta]) => text.replace(pattern, locale === 'ta' ? ta : hi), value);
  };

  const translationKey = useMemo(() => JSON.stringify({
    locale,
    items: items.map((item) => ({
      cropName: item.plan.crop_name,
      label: item.step?.label,
      tasks: item.step?.tasks,
      alertAdvice: item.step?.alertAdvice,
    })),
  }), [items, locale]);

  useEffect(() => {
    let cancelled = false;
    setTranslatedSteps([]);
    if (locale === 'en' || !items.length) return;

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locale,
        kind: 'crop_plan',
        payload: items.map((item) => ({
          cropName: item.plan.crop_name,
          label: item.step?.label,
          tasks: item.step?.tasks,
          alertAdvice: item.step?.alertAdvice,
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('translate failed'))))
      .then((data) => {
        if (!cancelled && Array.isArray(data.payload)) setTranslatedSteps(data.payload);
      })
      .catch(() => {
        if (!cancelled) setTranslatedSteps([]);
      });

    return () => {
      cancelled = true;
    };
  }, [locale, translationKey]);

  if (!activePlans.length) {
    return (
      <div className="flex flex-col rounded-xl border border-gray-100 bg-white shadow">
        <div className="flex items-center gap-2 border-b border-gray-100 p-4">
          <ListChecks className="h-4 w-4 text-brand-600" />
          <h3 className="font-semibold text-gray-700">{t('Your Crop Plan', 'आपकी फसल योजना', 'உங்கள் பயிர் திட்டம்')}</h3>
        </div>
        <Link href="/crop-plan" className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-gray-500 hover:bg-gray-50">
          <Sprout className="h-8 w-8 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">{t('Create your crop plan', 'अपनी फसल योजना बनाएं', 'உங்கள் பயிர் திட்டத்தை உருவாக்கவும்')}</p>
          <p className="text-xs">{t('A full season roadmap from sowing to selling', 'बुवाई से बिक्री तक पूरा सीजन रोडमैप', 'விதைப்பு முதல் விற்பனை வரை முழு பருவ வழித்தடம்')}</p>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center gap-2 border-b border-gray-100 p-4">
        <ListChecks className="h-4 w-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Active Crop Plans', 'सक्रिय फसल योजनाएं', 'செயலில் உள்ள பயிர் திட்டங்கள்')}</h3>
        <Link href="/crop-plan" className="ml-auto flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700">
          {t('Open', 'खोलें', 'திற')} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-3 p-4">
        {items.map(({ plan: item, step }, index) => {
          const translated = translatedSteps[index];
          return (
            <div key={`${item.crop_name ?? 'crop'}-${index}`} className="rounded-xl bg-brand-50 p-3">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                <Sprout className="h-4 w-4 text-brand-600" /> {localizeText(translated?.cropName ?? item.crop_name)}
              </p>

              {!step ? (
                <p className="mt-2 text-sm text-gray-500">{t('Plan complete - well done!', 'योजना पूरी - बहुत अच्छा!', 'திட்டம் முடிந்தது - அருமை!')}</p>
              ) : (
                <>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-brand-700">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {step.state === 'active'
                      ? t('Now', 'अभी', 'இப்போது')
                      : t(`In ${step.daysAway} day${step.daysAway === 1 ? '' : 's'}`, `${step.daysAway} दिन में`, `${step.daysAway} நாளில்`)}
                    {' - '}{fmt(step.date)}{step.endDate ? ` - ${fmt(step.endDate)}` : ''}
                  </p>
                  <p className="mt-1 font-medium text-gray-800">{localizeText(translated?.label ?? step.label)}</p>
                  {step.tasks && <p className="mt-1 text-sm text-gray-600">{localizeText(translated?.tasks ?? step.tasks)}</p>}
                  {step.alert && step.alertAdvice && (
                    <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {localizeText(translated?.alertAdvice ?? step.alertAdvice)}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
