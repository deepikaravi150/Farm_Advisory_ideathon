'use client';
import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import Navbar from '@/components/layout/Navbar';
import StateAssessmentModal, { type AssessmentPayload } from '@/components/crop-plan/StateAssessmentModal';
import CropSuggestions from '@/components/crop-plan/CropSuggestions';
import PlanTimeline from '@/components/crop-plan/PlanTimeline';
import PlanChatPanel from '@/components/crop-plan/PlanChatPanel';
import { Activity, AlertTriangle, CheckCircle2, CloudSun, Droplets, Loader2, RefreshCw, Leaf, Save, Trash2 } from 'lucide-react';
import type { CropPlan, Milestone, SuggestedCrop } from '@/lib/types/crop-plan';

type FarmerState = 'planning_unsure' | 'planning_specific' | 'mid_grow';
type SavedPlan = CropPlan & { planId: string; status?: string; currentStage?: string | null; activeFrom?: string; createdAt?: string; inputDetails?: Record<string, unknown> };
type ActiveCropPlan = CropPlan | SavedPlan;
type CurrentPlanData = ReturnType<typeof extractCurrentPlanData>;

function sameDisplayText(a: CropPlan, b: CropPlan) {
  const firstA = a.milestones?.[0];
  const firstB = b.milestones?.[0];
  return a.cropName === b.cropName &&
    a.sellWindow === b.sellWindow &&
    a.storageNotes === b.storageNotes &&
    firstA?.label === firstB?.label &&
    firstA?.tasks === firstB?.tasks &&
    firstA?.weatherRequirement === firstB?.weatherRequirement;
}

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
    currentStage: typeof p.current_stage === 'string' ? p.current_stage : null,
    activeFrom: typeof p.active_from === 'string' ? p.active_from : undefined,
    createdAt: typeof p.created_at === 'string' ? p.created_at : undefined,
    inputDetails: (p.input_details ?? {}) as Record<string, unknown>,
  };
}

function isSavedPlan(plan: ActiveCropPlan | null | undefined): plan is SavedPlan {
  return Boolean(plan && 'planId' in plan);
}

function localizeCropName(name: string, locale: 'en' | 'hi' | 'ta') {
  if (locale === 'en') return name;
  const crops: Record<string, { hi: string; ta: string }> = {
    Paddy: { hi: 'धान', ta: 'நெல்' },
    Groundnut: { hi: 'मूंगफली', ta: 'நிலக்கடலை' },
    Maize: { hi: 'मक्का', ta: 'மக்காச்சோளம்' },
    Sugarcane: { hi: 'गन्ना', ta: 'கரும்பு' },
    Cotton: { hi: 'कपास', ta: 'பருத்தி' },
    Tomato: { hi: 'टमाटर', ta: 'தக்காளி' },
    Brinjal: { hi: 'बैंगन', ta: 'கத்திரிக்காய்' },
    Chilli: { hi: 'मिर्च', ta: 'மிளகாய்' },
    Banana: { hi: 'केला', ta: 'வாழை' },
    Turmeric: { hi: 'हल्दी', ta: 'மஞ்சள்' },
    'Black gram': { hi: 'उड़द', ta: 'உளுந்து' },
    'Green gram': { hi: 'मूंग', ta: 'பச்சைப்பயறு' },
    Sesame: { hi: 'तिल', ta: 'எள்' },
    Millets: { hi: 'मोटे अनाज', ta: 'சிறுதானியங்கள்' },
  };
  return crops[name]?.[locale] ?? name;
}

function localizeRisk(risk: string, locale: 'en' | 'hi' | 'ta') {
  if (locale === 'ta') {
    if (risk === 'High') return 'அதிகம்';
    if (risk === 'Medium') return 'மிதமானது';
    if (risk === 'Low') return 'குறைவு';
  }
  if (locale === 'hi') {
    if (risk === 'High') return 'अधिक';
    if (risk === 'Medium') return 'मध्यम';
    if (risk === 'Low') return 'कम';
  }
  return risk;
}

function formatCurrency(value: number, locale: 'en' | 'hi' | 'ta') {
  const amount = value.toLocaleString('en-IN');
  if (locale === 'ta') return `₹${amount}`;
  if (locale === 'hi') return `₹${amount}`;
  return `Rs.${amount}`;
}

function addDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().split('T')[0];
}

function daysBetween(start: string, end: string) {
  const a = new Date(`${start}T00:00:00`).getTime();
  const b = new Date(`${end}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function getMilestoneDates(plan: CropPlan, m: Milestone, sourcePlan?: ActiveCropPlan | null) {
  if (!isSavedPlan(sourcePlan) || !sourcePlan.activeFrom || !plan.startDate) {
    return { date: m.date, endDate: m.endDate ?? m.date };
  }

  const offset = daysBetween(plan.startDate, m.date);
  const duration = daysBetween(m.date, m.endDate ?? m.date);
  const date = addDays(sourcePlan.activeFrom, Math.max(0, offset));
  return { date, endDate: addDays(date, Math.max(0, duration)) };
}

function getStageStatus(plan: CropPlan, m: Milestone, sourcePlan?: ActiveCropPlan | null) {
  const today = new Date().toISOString().split('T')[0];
  const dates = getMilestoneDates(plan, m, sourcePlan);
  const end = dates.endDate;
  if (m.alert) return 'alert';
  if (end < today) return 'done';
  if (dates.date <= today && today <= end) return 'active';
  return 'pending';
}

function getCurrentMilestone(plan: CropPlan, sourcePlan?: ActiveCropPlan | null) {
  return plan.milestones.find((m) => getStageStatus(plan, m, sourcePlan) === 'active') ??
    plan.milestones.find((m) => getStageStatus(plan, m, sourcePlan) === 'alert') ??
    plan.milestones.find((m) => getStageStatus(plan, m, sourcePlan) === 'pending') ??
    plan.milestones[plan.milestones.length - 1] ??
    null;
}

function currentAdvice(plan: CropPlan, locale: 'en' | 'hi' | 'ta', sourcePlan?: ActiveCropPlan | null) {
  const current = getCurrentMilestone(plan, sourcePlan);
  const alertCount = plan.milestones.filter((m) => m.alert).length;
  const rainMention = current?.weatherSummary?.toLowerCase().includes('rain') || current?.weatherRequirement?.toLowerCase().includes('rain');
  const thunderMention = current?.weatherSummary?.toLowerCase().includes('thunder');
  const crop = localizeCropName(plan.cropName, locale);

  if (!current) {
    return {
      stage: '',
      title: locale === 'ta' ? 'தற்போதைய திட்டம்' : locale === 'hi' ? 'वर्तमान योजना' : 'Current plan',
      summary: locale === 'ta' ? `${crop} திட்டம் செயலில் உள்ளது.` : locale === 'hi' ? `${crop} योजना सक्रिय है।` : `${crop} plan is active.`,
      water: locale === 'ta' ? 'பாசனத்தை மண் ஈரப்பதத்தை பார்த்து செய்யவும்.' : locale === 'hi' ? 'मिट्टी की नमी देखकर सिंचाई करें।' : 'Irrigate based on soil moisture.',
      action: locale === 'ta' ? 'அடுத்த கட்ட பணிகளை சரிபார்க்கவும்.' : locale === 'hi' ? 'अगले चरण के कार्य जांचें।' : 'Review the next stage tasks.',
      risk: 'Low',
    };
  }

  const risk = thunderMention || current.alert ? 'High' : rainMention || alertCount ? 'Medium' : 'Low';
  return {
    stage: current.label,
    title: locale === 'ta' ? 'தற்போதைய செயலில் உள்ள திட்டம்' : locale === 'hi' ? 'वर्तमान सक्रिय योजना' : 'Current Active Plan',
    summary: locale === 'ta'
      ? `${crop} பயிரின் "${current.label}" கட்டம் இப்போது கவனத்தில் இருக்க வேண்டும். வானிலை, நீர் மற்றும் பயிர் நிலையை பார்த்து பணிகளை செய்யுங்கள்.`
      : locale === 'hi'
        ? `${crop} फसल का "${current.label}" चरण अभी ध्यान में रखना चाहिए। मौसम, पानी और फसल की स्थिति देखकर कार्य करें।`
        : `${crop} is currently around the "${current.label}" stage. Use weather, water, and crop condition before doing field work.`,
    water: thunderMention
      ? (locale === 'ta' ? 'இடி மின்னல் நாளில் பாசனம்/தெளிப்பை தவிர்க்கவும்; வடிகாலையை திறந்திருங்கள்.' : locale === 'hi' ? 'आंधी-तूफान वाले दिन सिंचाई/छिड़काव से बचें; जल निकासी खुली रखें।' : 'Avoid irrigation/spraying during thunderstorms; keep drainage open.')
      : rainMention
        ? (locale === 'ta' ? 'மழை வாய்ப்பு உள்ளது. பாசனத்தை குறைத்து, தாழ்வான பகுதியில் நீர் தேங்காமல் பார்த்துக் கொள்ளவும்.' : locale === 'hi' ? 'बारिश की संभावना है। सिंचाई कम करें और निचले क्षेत्र में जलभराव रोकें।' : 'Rain is likely. Reduce irrigation and prevent waterlogging in low areas.')
        : (locale === 'ta' ? 'மண் ஈரப்பதம் குறைந்தால் மட்டும் காலை அல்லது மாலை லேசாக பாசனம் செய்யவும்.' : locale === 'hi' ? 'मिट्टी सूखी हो तो सुबह या शाम हल्की सिंचाई करें।' : 'If soil is dry, irrigate lightly in the morning or evening.'),
    action: thunderMention
      ? (locale === 'ta' ? 'மின்னல் நேரத்தில் திறந்த வயல் பணிகளை நிறுத்தி, இளம் செடிகளை பாதுகாக்கவும்.' : locale === 'hi' ? 'बिजली के दौरान खुले खेत का काम रोकें और नई पौध सुरक्षित करें।' : 'Stop open-field work during lightning and secure young plants.')
      : current.tasks,
    risk,
  };
}

function activePlanRecommendations(plan: CropPlan, locale: 'en' | 'hi' | 'ta') {
  const current = getCurrentMilestone(plan);
  const stageText = `${current?.label ?? ''} ${current?.tasks ?? ''}`.toLowerCase();
  const weatherText = `${current?.weatherSummary ?? ''} ${current?.weatherRequirement ?? ''}`.toLowerCase();
  const hasThunder = weatherText.includes('thunder');
  const hasRain = weatherText.includes('rain') || weatherText.includes('drizzle');
  const crop = plan.cropName;

  const cropNeeds = locale === 'ta'
    ? `${crop} பயிருக்கு இப்போது நிலையான மண் ஈரப்பதம், களை கட்டுப்பாடு, வடிகால் மற்றும் இலை/தண்டு கண்காணிப்பு முக்கியம்.`
    : locale === 'hi'
      ? `${crop} फसल को अभी स्थिर मिट्टी नमी, खरपतवार नियंत्रण, जल निकासी और पत्ती/तना निरीक्षण की जरूरत है।`
      : `${crop} currently needs steady soil moisture, weed control, drainage, and leaf/stem scouting.`;

  const waterNeed = hasThunder
    ? (locale === 'ta'
        ? 'இடி மின்னல் இருந்தால் பாசனம் மற்றும் தெளிப்பை நிறுத்தவும். மழைநீர் வெளியேற வடிகாலையை திறந்துவைக்கவும்.'
        : locale === 'hi'
          ? 'आंधी-तूफान हो तो सिंचाई और छिड़काव रोकें। बारिश का पानी निकालने के लिए जल निकासी खुली रखें।'
          : 'If thunderstorms are expected, pause irrigation and spraying. Keep drainage open so rainwater can leave the field.')
    : hasRain
      ? (locale === 'ta'
          ? 'மழை வாய்ப்பு இருப்பதால் பாசனத்தை குறைக்கவும். மண் உலர்ந்திருந்தால் மட்டும் லேசாக நீர் விடவும்.'
          : locale === 'hi'
            ? 'बारिश की संभावना है, इसलिए सिंचाई कम करें। मिट्टी सूखी हो तभी हल्की सिंचाई करें।'
            : 'Rain is likely, so reduce irrigation. Water lightly only if soil is dry.')
      : (locale === 'ta'
          ? 'மண் 2-3 செ.மீ ஆழத்தில் உலர்ந்தால் காலை அல்லது மாலை லேசான பாசனம் செய்யவும்.'
          : locale === 'hi'
            ? 'मिट्टी 2-3 सेमी गहराई तक सूखी हो तो सुबह या शाम हल्की सिंचाई करें।'
            : 'If the top 2-3 cm soil is dry, irrigate lightly in the morning or evening.');

  let inputs = locale === 'ta'
    ? 'மண் அறிக்கை இருந்தால் அதன்படி உர அளவை முடிவு செய்யவும். அறிகுறி இல்லாமல் பூச்சிக்கொல்லி தெளிக்க வேண்டாம்.'
    : locale === 'hi'
      ? 'मिट्टी रिपोर्ट हो तो उसी के अनुसार खाद मात्रा तय करें। लक्षण न हों तो कीटनाशक न छिड़कें।'
      : 'Use the soil report to decide fertilizer dose. Do not spray pesticide unless symptoms are visible.';

  if (stageText.includes('seed') || stageText.includes('sow') || stageText.includes('nursery')) {
    inputs = locale === 'ta'
      ? 'விதைப்பு கட்டத்தில் பரிந்துரைக்கப்பட்ட விதை நேர்த்தி செய்யவும். மழைக்கு முன் உரம்/தெளிப்பு செய்ய வேண்டாம்.'
      : locale === 'hi'
        ? 'बुवाई चरण में सिफारिशी बीज उपचार करें। बारिश से पहले खाद या छिड़काव न करें।'
        : 'At sowing, use recommended seed treatment. Avoid fertilizer or sprays just before rain.';
  } else if (stageText.includes('nutrient') || stageText.includes('fertil') || stageText.includes('manure')) {
    inputs = locale === 'ta'
      ? 'உரம் பிரித்தளவில் இடவும். மக்கிய தொழு உரம்/கம்போஸ்ட் பயன்படுத்தலாம்; மழை நாளில் உரமிட வேண்டாம்.'
      : locale === 'hi'
        ? 'खाद विभाजित मात्रा में दें। सड़ी गोबर खाद/कंपोस्ट उपयोग करें; बारिश वाले दिन खाद न डालें।'
        : 'Apply nutrients in split doses. Use well-decomposed FYM/compost; avoid fertilizing on rainy days.';
  } else if (stageText.includes('pest') || stageText.includes('disease') || stageText.includes('flower')) {
    inputs = locale === 'ta'
      ? 'இலைகள், தண்டு, பூக்களை வாரத்தில் இருமுறை பாருங்கள். பூச்சி/நோய் அறிகுறி இருந்தால் மட்டுமே உயிரியல் அல்லது பரிந்துரைக்கப்பட்ட மருந்தை பயன்படுத்தவும்.'
      : locale === 'hi'
        ? 'पत्ते, तना और फूल सप्ताह में दो बार देखें। कीट/रोग लक्षण दिखें तभी जैविक या सिफारिशी दवा उपयोग करें।'
        : 'Scout leaves, stems, and flowers twice a week. Use biological or recommended pesticide only when pest/disease symptoms appear.';
  } else if (stageText.includes('harvest')) {
    inputs = locale === 'ta'
      ? 'அறுவடைக்கு அருகில் பூச்சிக்கொல்லி தவிர்க்கவும். விளைபொருளை நன்றாக உலர்த்தி சுத்தமாக சேமிக்கவும்.'
      : locale === 'hi'
        ? 'कटाई के पास कीटनाशक से बचें। उपज को अच्छी तरह सुखाकर साफ तरीके से रखें।'
        : 'Avoid pesticide close to harvest. Dry and store produce cleanly.';
  }

  return { cropNeeds, waterNeed, inputs };
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function splitReadableText(text?: string) {
  return (text ?? '')
    .split(/\n|(?<=[.!?।])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function uniqueLines(lines: string[]) {
  return Array.from(new Set(lines.map((line) => line.trim()).filter(Boolean)));
}

function pickLines(lines: string[], keywords: string[]) {
  return lines.filter((line) => {
    const normalized = line.toLowerCase();
    return keywords.some((word) => normalized.includes(word.toLowerCase()));
  });
}

function getSavedInputDetails(plan: ActiveCropPlan | null) {
  if (!isSavedPlan(plan)) return {};
  return plan.inputDetails ?? {};
}

function localizeAssessmentValue(value: string, locale: 'en' | 'hi' | 'ta') {
  if (locale === 'en') return value;
  const values: Record<string, { hi: string; ta: string }> = {
    'New to farming': { hi: 'खेती में नए', ta: 'விவசாயத்தில் புதியவர்' },
    'Less than 3 years': { hi: '3 साल से कम', ta: '3 ஆண்டுகளுக்கும் குறைவு' },
    '3-10 years': { hi: '3-10 साल', ta: '3-10 ஆண்டுகள்' },
    '3–10 years': { hi: '3-10 साल', ta: '3-10 ஆண்டுகள்' },
    'More than 10 years': { hi: '10 साल से अधिक', ta: '10 ஆண்டுகளுக்கும் மேல்' },
    Yes: { hi: 'हाँ', ta: 'ஆம்' },
    No: { hi: 'नहीं', ta: 'இல்லை' },
    Good: { hi: 'अच्छा', ta: 'நன்று' },
    Average: { hi: 'औसत', ta: 'சராசரி' },
    Poor: { hi: 'कमजोर', ta: 'பலவீனம்' },
    'Rain-fed only': { hi: 'केवल वर्षा आधारित', ta: 'மழை சார்ந்தது மட்டும்' },
    Borewell: { hi: 'बोरवेल', ta: 'ஆழ்துளை கிணறு' },
    Canal: { hi: 'नहर', ta: 'கால்வாய்' },
    'Open well / pond': { hi: 'खुला कुआं / तालाब', ta: 'திறந்த கிணறு / குளம்' },
    'Drip / sprinkler': { hi: 'ड्रिप / स्प्रिंकलर', ta: 'சொட்டு / தெளிப்பு பாசனம்' },
    None: { hi: 'कोई नहीं', ta: 'இல்லை' },
    Chemical: { hi: 'रासायनिक', ta: 'ரசாயன' },
    Organic: { hi: 'जैविक', ta: 'இயற்கை' },
    'Both chemical & organic': { hi: 'रासायनिक और जैविक दोनों', ta: 'ரசாயனமும் இயற்கையும்' },
  };
  return values[value]?.[locale] ?? value;
}

function getAssessmentValue(inputDetails: Record<string, unknown>, key: string, locale: 'en' | 'hi' | 'ta') {
  const assessment = inputDetails.assessment;
  if (!assessment || typeof assessment !== 'object') return '';
  const value = textValue((assessment as Record<string, unknown>)[key]);
  return value ? localizeAssessmentValue(value, locale) : '';
}

function extractCurrentPlanData(displayPlan: CropPlan, sourcePlan: ActiveCropPlan | null, locale: 'en' | 'hi' | 'ta') {
  const current = getCurrentMilestone(displayPlan, sourcePlan);
  const inputDetails = getSavedInputDetails(sourcePlan);
  const stageLines = splitReadableText(current?.tasks);
  const weatherLines = uniqueLines([
    current?.weatherRequirement ?? '',
    current?.weatherSummary ?? '',
    current?.alertAdvice ?? '',
  ]);

  const waterKeywords = [
    'water', 'irrig', 'moisture', 'rain', 'drain', 'waterlogging', 'drizzle',
    'நீர்', 'பாசனம்', 'ஈர', 'மழை', 'வடிகால்',
    'पानी', 'सिंचाई', 'नमी', 'बारिश', 'जल',
  ];
  const inputKeywords = [
    'fertil', 'manure', 'nutrient', 'compost', 'pesticide', 'pest', 'disease',
    'fungicide', 'biofertilizer', 'spray', 'seed treatment',
    'உரம்', 'சத்து', 'பூச்சி', 'நோய்', 'தெளிப்பு', 'விதை நேர்த்தி',
    'खाद', 'उर्वरक', 'पोषक', 'कीट', 'रोग', 'छिड़क', 'बीज उपचार',
  ];
  const landKeywords = [
    'soil', 'field', 'land', 'slope', 'drain', 'weed', 'clod', 'level',
    'மண்', 'நிலம்', 'வயல்', 'களை', 'வடிகால்',
    'मिट्टी', 'खेत', 'भूमि', 'खरपतवार', 'जल निकासी',
  ];

  const waterLines = uniqueLines([
    ...pickLines(stageLines, waterKeywords),
    ...pickLines(weatherLines, waterKeywords),
  ]);
  const inputLines = uniqueLines(pickLines(stageLines, inputKeywords));
  const landLines = uniqueLines([
    ...pickLines(stageLines, landKeywords),
    ...pickLines(weatherLines, landKeywords),
    getAssessmentValue(inputDetails, 'irrigation', locale),
    getAssessmentValue(inputDetails, 'pastIssues', locale),
  ]);

  return {
    current,
    stageLines,
    weatherLines,
    waterLines,
    inputLines,
    landLines,
    currentCropInfo: textValue(inputDetails.currentCropInfo),
    experience: getAssessmentValue(inputDetails, 'experience', locale),
    previousCrops: getAssessmentValue(inputDetails, 'previousCrops', locale),
    lastHarvest: getAssessmentValue(inputDetails, 'lastHarvest', locale),
    fertilizersUsed: getAssessmentValue(inputDetails, 'fertilizers', locale),
    irrigation: getAssessmentValue(inputDetails, 'irrigation', locale),
    pastIssues: getAssessmentValue(inputDetails, 'pastIssues', locale),
  };
}

function upsertSavedPlan(plans: SavedPlan[], plan: SavedPlan) {
  return [plan, ...plans.filter(existing => existing.planId !== plan.planId)];
}

export default function CropPlanPage() {
  const t = useTranslations('cropPlan');
  const locale = useLocale() as 'en' | 'hi' | 'ta';
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedCrop[]>([]);
  const [activePlan, setActivePlan] = useState<ActiveCropPlan | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingInputDetails, setPendingInputDetails] = useState<Record<string, unknown> | null>(null);
  const [planError, setPlanError] = useState('');
  const [translatedPlan, setTranslatedPlan] = useState<CropPlan | null>(null);
  const [translatedCurrentPlanData, setTranslatedCurrentPlanData] = useState<CurrentPlanData | null>(null);
  const [translatingPlan, setTranslatingPlan] = useState(false);
  const [translationError, setTranslationError] = useState('');

  useEffect(() => {
    refreshPlans().catch(() => setShowModal(true))
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!activePlan || locale === 'en') {
      setTranslatedPlan(null);
      setTranslatingPlan(false);
      setTranslationError('');
      return;
    }

    const storageKey = `translated-plan-v4:${locale}:${JSON.stringify(activePlan)}`;
    const cached = sessionStorage.getItem(storageKey);
    if (cached) {
      try {
        setTranslatedPlan(JSON.parse(cached) as CropPlan);
        setTranslatingPlan(false);
        return;
      } catch {
        sessionStorage.removeItem(storageKey);
      }
    }

    setTranslatedPlan(null);
    setTranslationError('');
    setTranslatingPlan(true);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, kind: 'crop_plan', payload: activePlan }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('translation failed')))
      .then((data) => {
        if (cancelled) return;
        const next = data.payload as CropPlan;
        if (sameDisplayText(activePlan, next)) throw new Error('translation returned original text');
        setTranslatedPlan(next);
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      })
      .catch(() => {
        if (!cancelled) {
          setTranslatedPlan(null);
          setTranslationError(
            locale === 'ta'
              ? 'திட்டத்தை தமிழில் மொழிபெயர்க்க முடியவில்லை. மீண்டும் முயற்சிக்க புதுப்பிக்கவும்.'
              : locale === 'hi'
                ? 'योजना का अनुवाद नहीं हो पाया। फिर से कोशिश करने के लिए पेज रीफ्रेश करें।'
                : 'Plan translation failed. Refresh to try again.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setTranslatingPlan(false);
      });

    return () => { cancelled = true; };
  }, [activePlan, locale]);

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

  async function makePlanActive(plan: SavedPlan) {
    setSaving(true);
    setPlanError('');
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', planId: plan.planId }),
      });
      if (!res.ok) throw new Error('Unable to make plan active');
      const activeFrom = new Date().toISOString().split('T')[0];
      setSavedPlans(prev => prev.map(p => p.planId === plan.planId ? { ...p, status: 'active', activeFrom } : p));
      setActivePlan({ ...plan, status: 'active', activeFrom });
      await refreshPlans();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Unable to make plan active');
    } finally {
      setSaving(false);
    }
  }

  async function makePlanInactive(plan: SavedPlan) {
    setSaving(true);
    setPlanError('');
    try {
      const res = await fetch('/api/crop-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deactivate', planId: plan.planId }),
      });
      if (!res.ok) throw new Error('Unable to make plan inactive');
      setSavedPlans(prev => prev.map(p => p.planId === plan.planId ? { ...p, status: 'planned' } : p));
      setActivePlan({ ...plan, status: 'planned' });
      await refreshPlans();
    } catch (err) {
      setPlanError(err instanceof Error ? err.message : 'Unable to make plan inactive');
    } finally {
      setSaving(false);
    }
  }

  const displayPlan = translatedPlan ?? activePlan;
  const selectedIsCurrent = isSavedPlan(activePlan) && activePlan.status === 'active';
  const insight = displayPlan ? currentAdvice(displayPlan, locale, activePlan) : null;
  const currentMilestone = displayPlan ? getCurrentMilestone(displayPlan, activePlan) : null;
  const currentMilestoneDates = displayPlan && currentMilestone ? getMilestoneDates(displayPlan, currentMilestone, activePlan) : null;
  const currentPlanData = displayPlan ? extractCurrentPlanData(displayPlan, activePlan, locale) : null;
  const currentPlanDataKey = currentPlanData ? JSON.stringify(currentPlanData) : '';
  const currentPlanDisplayData = translatedCurrentPlanData ?? currentPlanData;
  const localizedDisplayCropName = displayPlan ? localizeCropName(displayPlan.cropName, locale) : '';
  const localizedDisplayPlan = displayPlan ? { ...displayPlan, cropName: localizedDisplayCropName } : null;
  const localizedRisk = insight ? localizeRisk(insight.risk, locale) : '';

  useEffect(() => {
    let cancelled = false;
    if (!currentPlanData) {
      setTranslatedCurrentPlanData(null);
      return;
    }

    setTranslatedCurrentPlanData(null);
    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale, kind: 'current_plan_details', payload: currentPlanData }),
    })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('current plan detail translation failed')))
      .then((data) => {
        if (cancelled) return;
        const payload = data.payload as Partial<CurrentPlanData>;
        setTranslatedCurrentPlanData({
          ...currentPlanData,
          ...payload,
          current: currentPlanData.current,
        });
      })
      .catch(() => {
        if (!cancelled) setTranslatedCurrentPlanData(null);
      });

    return () => { cancelled = true; };
  }, [locale, currentPlanDataKey]);
  const labels = {
    savedPlans: locale === 'ta' ? 'சேமித்த திட்டங்கள்' : locale === 'hi' ? 'सहेजी गई योजनाएं' : 'Saved Plans',
    save: locale === 'ta' ? 'சேமி' : locale === 'hi' ? 'सहेजें' : 'Save',
    selectedPlanDetails: locale === 'ta' ? 'தேர்ந்தெடுத்த திட்ட விவரங்கள்' : locale === 'hi' ? 'चयनित योजना विवरण' : 'Selected Plan Details',
    saveToSavedPlans: locale === 'ta' ? 'சேமித்த திட்டங்களில் சேமி' : locale === 'hi' ? 'सहेजी गई योजनाओं में सहेजें' : 'Save to Saved Plans',
    unsavedPlan: locale === 'ta'
      ? 'சேமிக்காத புதிய திட்டம். இந்த திட்டத்தை சேமித்து சேமித்த திட்டங்களில் காட்ட, சேமி என்பதை கிளிக் செய்யவும்.'
      : locale === 'hi'
        ? 'नई योजना अभी सहेजी नहीं गई है। इसे सहेजी गई योजनाओं में दिखाने के लिए सहेजें पर क्लिक करें।'
        : 'Unsaved new plan. Click Save to Saved Plans to store this plan and show it in Saved Plans.',
    noStartDate: locale === 'ta' ? 'தொடக்க தேதி இல்லை' : locale === 'hi' ? 'शुरू तारीख नहीं' : 'No start date',
    makeCurrent: locale === 'ta' ? 'தற்போதையதாக அமை' : locale === 'hi' ? 'वर्तमान बनाएं' : 'Make current',
    makeInactive: locale === 'ta' ? 'செயலில் இல்லாததாக மாற்று' : locale === 'hi' ? 'निष्क्रिय करें' : 'Make inactive',
    current: locale === 'ta' ? 'தற்போதையது' : locale === 'hi' ? 'वर्तमान' : 'Current',
    stages: locale === 'ta' ? 'கட்டங்கள்' : locale === 'hi' ? 'चरण' : 'stages',
    budget: locale === 'ta' ? 'பட்ஜெட்' : locale === 'hi' ? 'बजट' : 'Budget',
    harvest: locale === 'ta' ? 'அறுவடை' : locale === 'hi' ? 'कटाई' : 'Harvest',
    planAssistant: locale === 'ta' ? 'திட்ட உதவியாளர்' : locale === 'hi' ? 'योजना सहायक' : 'Plan assistant',
    currentAdvice: locale === 'ta' ? 'தற்போதைய பரிந்துரை' : locale === 'hi' ? 'वर्तमान सुझाव' : 'Current suggestion',
    currentStage: locale === 'ta' ? 'தற்போதைய கட்டம்' : locale === 'hi' ? 'वर्तमान चरण' : 'Current stage',
    activeCropStatus: locale === 'ta' ? 'செயலில் உள்ள பயிர் நிலை' : locale === 'hi' ? 'सक्रिय फसल स्थिति' : 'Active crop status',
    cropWaterNeeds: locale === 'ta' ? 'பயிர் & நீர் தேவை' : locale === 'hi' ? 'फसल और पानी की जरूरत' : 'Crop & water needs',
    inputRecommendation: locale === 'ta' ? 'பூச்சிக்கொல்லி / உர பரிந்துரை' : locale === 'hi' ? 'कीटनाशक / खाद सुझाव' : 'Pesticide / manure / fertilizer',
    planned: locale === 'ta' ? 'திட்டமிடப்பட்டது' : locale === 'hi' ? 'योजनाबद्ध' : 'planned',
    notSet: locale === 'ta' ? 'அமைக்கப்படவில்லை' : locale === 'hi' ? 'सेट नहीं' : 'Not set',
    risk: locale === 'ta' ? 'ஆபத்து' : locale === 'hi' ? 'जोखिम' : 'Risk',
    water: locale === 'ta' ? 'நீர் / பாசனம்' : locale === 'hi' ? 'पानी / सिंचाई' : 'Water / irrigation',
    nextAction: locale === 'ta' ? 'அடுத்த செயல்' : locale === 'hi' ? 'अगला काम' : 'Next action',
    startingOn: locale === 'ta' ? 'தொடங்கும் தேதி' : locale === 'hi' ? 'शुरू होने की तारीख' : 'Starting on',
    stageDetails: locale === 'ta' ? 'தற்போதைய கட்ட விவரங்கள்' : locale === 'hi' ? 'वर्तमान चरण विवरण' : 'Current stage details',
    cropInfo: locale === 'ta' ? 'பயிர் தகவல்' : locale === 'hi' ? 'फसल जानकारी' : 'Crop Info',
    landRequirements: locale === 'ta' ? 'நிலம் மற்றும் தேவைகள்' : locale === 'hi' ? 'भूमि और जरूरतें' : 'Land and requirements',
    stageTasks: locale === 'ta' ? 'கட்ட பணிகள்' : locale === 'hi' ? 'चरण कार्य' : 'Stage tasks',
    weatherFromPlan: locale === 'ta' ? 'திட்டத்தில் உள்ள வானிலை' : locale === 'hi' ? 'योजना में मौसम' : 'Weather in plan',
    waterFromPlan: locale === 'ta' ? 'நீர் தகவல்' : locale === 'hi' ? 'पानी की जानकारी' : 'Water details',
    inputsFromPlan: locale === 'ta' ? 'உரம் / பூச்சி / உள்ளீடுகள்' : locale === 'hi' ? 'खाद / कीट / इनपुट' : 'Fertilizer / pest / inputs',
    noRecordedData: locale === 'ta' ? 'இந்த கட்டத்தில் இந்த விவரம் பதிவு செய்யப்படவில்லை.' : locale === 'hi' ? 'इस चरण में यह जानकारी दर्ज नहीं है।' : 'No recorded detail for this current stage.',
    crop: locale === 'ta' ? 'பயிர்' : locale === 'hi' ? 'फसल' : 'Crop',
    sellWindow: locale === 'ta' ? 'விற்பனை காலம்' : locale === 'hi' ? 'बिक्री अवधि' : 'Sell window',
    experience: locale === 'ta' ? 'அனுபவம்' : locale === 'hi' ? 'अनुभव' : 'Experience',
    previousCrops: locale === 'ta' ? 'முந்தைய பயிர்கள்' : locale === 'hi' ? 'पिछली फसलें' : 'Previous crops',
    lastHarvest: locale === 'ta' ? 'கடைசி அறுவடை' : locale === 'hi' ? 'पिछली कटाई' : 'Last harvest',
    irrigation: locale === 'ta' ? 'பாசன மூலம்' : locale === 'hi' ? 'सिंचाई स्रोत' : 'Irrigation source',
    fertilizersUsed: locale === 'ta' ? 'முன்பு பயன்படுத்திய உரம்' : locale === 'hi' ? 'पहले इस्तेमाल खाद' : 'Fertilizers used',
    pastIssues: locale === 'ta' ? 'முந்தைய சிக்கல்கள்' : locale === 'hi' ? 'पिछली समस्याएं' : 'Past issues',
  };

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
              <h2 className="text-sm font-semibold text-gray-800">{labels.savedPlans}</h2>
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
                  {labels.save}
                </button>
              )}
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {savedPlans.map((plan) => {
                const selected = activePlan && 'planId' in activePlan
                  ? activePlan.planId === plan.planId
                  : activePlan?.cropName === plan.cropName && activePlan?.startDate === plan.startDate;
                const isCurrent = plan.status === 'active';
                return (
                  <div
                    key={plan.planId}
                    className={`group relative min-w-[220px] text-left border rounded-lg px-3 py-2 transition-colors ${
                      selected ? 'border-brand-500 bg-brand-50' : 'border-gray-200 hover:border-brand-300'
                    }`}
                  >
                    <button type="button" onClick={() => setActivePlan(plan)} className="w-full text-left pr-7">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {selected && displayPlan ? localizedDisplayCropName : localizeCropName(plan.cropName, locale)}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{plan.startDate ?? labels.noStartDate}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3 w-3" />{labels.current}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500">
                            {labels.planned}
                          </span>
                        )}
                      </div>
                      <div className="max-h-0 overflow-hidden transition-all duration-200 group-hover:max-h-32">
                        <div className="mt-2 border-t border-gray-100 pt-2 space-y-1 text-xs text-gray-600">
                          <p>{plan.milestones.length} {labels.stages}</p>
                          <p>{labels.budget}: {formatCurrency(plan.totalBudgetEstimate, locale)}</p>
                          <p>{labels.harvest}: {plan.harvestDate || labels.notSet}</p>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isCurrent) makePlanInactive(plan);
                        else makePlanActive(plan);
                      }}
                      className={`mt-2 w-full rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                        isCurrent
                          ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      }`}
                    >
                      {isCurrent ? labels.makeInactive : labels.makeCurrent}
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

        {!loading && activePlan && displayPlan && localizedDisplayPlan && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-sm font-semibold text-gray-700">{labels.selectedPlanDetails}</h2>
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
                  {labels.saveToSavedPlans}
                </button>
              )}
            </div>
            {selectedIsCurrent && currentMilestone && insight && currentPlanDisplayData && (
              <div className="mb-6 grid gap-4 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          <Activity className="h-3.5 w-3.5" />{labels.currentStage}
                        </p>
                        <h3 className="mt-1 text-xl font-bold text-gray-900">
                          {currentMilestone.label}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                          {labels.startingOn}: <span className="font-semibold text-gray-900">{currentMilestoneDates?.date ?? currentMilestone.date}</span>
                        </p>
                      </div>
                      <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                        insight.risk === 'High' ? 'bg-red-50 text-red-700' :
                        insight.risk === 'Medium' ? 'bg-amber-50 text-amber-700' :
                        'bg-emerald-50 text-emerald-700'
                      }`}>
                        {labels.risk}: {localizedRisk}
                      </span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-gray-700">{insight.summary}</p>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                    <p className="mb-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />{labels.stageDetails}
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-xl bg-emerald-50 p-4">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-emerald-800">
                          <Leaf className="h-4 w-4" />{labels.stageTasks}
                        </p>
                        <ul className="space-y-2 text-sm leading-6 text-emerald-950">
                          {(currentPlanDisplayData.stageLines.length ? currentPlanDisplayData.stageLines : [labels.noRecordedData]).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl bg-sky-50 p-4">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-sky-800">
                          <Droplets className="h-4 w-4" />{labels.waterFromPlan}
                        </p>
                        <ul className="space-y-2 text-sm leading-6 text-sky-950">
                          {(currentPlanDisplayData.waterLines.length ? currentPlanDisplayData.waterLines : [labels.noRecordedData]).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="rounded-xl bg-amber-50 p-4 md:col-span-2">
                        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-amber-800">
                          <AlertTriangle className="h-4 w-4" />{labels.inputsFromPlan}
                        </p>
                        <ul className="space-y-2 text-sm leading-6 text-amber-950">
                          {[
                            ...currentPlanDisplayData.inputLines,
                            currentPlanDisplayData.fertilizersUsed ? `${labels.fertilizersUsed}: ${currentPlanDisplayData.fertilizersUsed}` : '',
                          ].filter(Boolean).length
                            ? [
                                ...currentPlanDisplayData.inputLines,
                                currentPlanDisplayData.fertilizersUsed ? `${labels.fertilizersUsed}: ${currentPlanDisplayData.fertilizersUsed}` : '',
                              ].filter(Boolean).map((line) => <li key={line}>{line}</li>)
                            : <li>{labels.noRecordedData}</li>}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      <Leaf className="h-3.5 w-3.5" />{labels.cropInfo}
                    </p>
                    <div className="space-y-2 text-sm text-gray-700">
                      <p><span className="font-semibold text-gray-900">{labels.crop}:</span> {localizedDisplayCropName}</p>
                      <p><span className="font-semibold text-gray-900">{labels.harvest}:</span> {displayPlan.harvestDate || labels.notSet}</p>
                      <p><span className="font-semibold text-gray-900">{labels.sellWindow}:</span> {displayPlan.sellWindow || labels.notSet}</p>
                      <p><span className="font-semibold text-gray-900">{labels.budget}:</span> {formatCurrency(displayPlan.totalBudgetEstimate, locale)}</p>
                      {currentPlanDisplayData.currentCropInfo && (
                        <p><span className="font-semibold text-gray-900">{labels.currentStage}:</span> {currentPlanDisplayData.currentCropInfo}</p>
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-sky-200 bg-white p-5 shadow-sm">
                    <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-sky-700">
                      <CloudSun className="h-3.5 w-3.5" />{labels.landRequirements}
                    </p>
                    <div className="space-y-3 text-sm text-gray-700">
                      {currentPlanDisplayData.irrigation && <p><span className="font-semibold text-gray-900">{labels.irrigation}:</span> {currentPlanDisplayData.irrigation}</p>}
                      {currentPlanDisplayData.experience && <p><span className="font-semibold text-gray-900">{labels.experience}:</span> {currentPlanDisplayData.experience}</p>}
                      {currentPlanDisplayData.previousCrops && <p><span className="font-semibold text-gray-900">{labels.previousCrops}:</span> {currentPlanDisplayData.previousCrops}</p>}
                      {currentPlanDisplayData.lastHarvest && <p><span className="font-semibold text-gray-900">{labels.lastHarvest}:</span> {currentPlanDisplayData.lastHarvest}</p>}
                      {currentPlanDisplayData.pastIssues && <p><span className="font-semibold text-gray-900">{labels.pastIssues}:</span> {currentPlanDisplayData.pastIssues}</p>}
                      {currentPlanDisplayData.landLines.length > 0 && (
                        <ul className="space-y-1 rounded-xl bg-emerald-50 p-3 leading-6 text-emerald-950">
                          {currentPlanDisplayData.landLines.map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      )}
                      <div className="rounded-xl bg-sky-50 p-3">
                        <p className="mb-2 font-semibold text-sky-900">{labels.weatherFromPlan}</p>
                        <ul className="space-y-1 leading-6 text-sky-950">
                          {(currentPlanDisplayData.weatherLines.length ? currentPlanDisplayData.weatherLines : [labels.noRecordedData]).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {pendingInputDetails && (
              <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
                {labels.unsavedPlan}
              </div>
            )}
            <div className="grid gap-6 lg:grid-cols-3 items-start">
            {/* Timeline */}
            <div className="lg:col-span-2 bg-white rounded-2xl shadow border border-gray-100 p-6">
              {translatingPlan && (
                <p className="mb-3 text-xs text-gray-400">{t('generatingSubtitle')}</p>
              )}
              {translationError && (
                <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">{translationError}</p>
              )}
              <PlanTimeline plan={localizedDisplayPlan} />
              {displayPlan.storageNotes && (
                <div className="mt-4 bg-earth-50 rounded-xl p-4 border border-earth-200">
                  <p className="text-sm font-medium text-earth-700 mb-1">{t('storageNotesTitle')}</p>
                  <p className="text-sm text-earth-600">{displayPlan.storageNotes}</p>
                </div>
              )}
            </div>
            {/* Current plan insight + assistant */}
            <div className="lg:col-span-1 lg:sticky lg:top-6 space-y-4">
              <div className="h-[600px]">
                <PlanChatPanel plan={localizedDisplayPlan} onApply={applyPlanChange} />
              </div>
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
