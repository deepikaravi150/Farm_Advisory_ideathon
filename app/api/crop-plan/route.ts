import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock } from '@/lib/ai/openai';
import { queryItems, putItem, getItem, updateItem, deleteItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { get15DayForecast, type ForecastDay } from '@/lib/weather';
import { annotateMilestonesWithWeather, forecastSummaryForPrompt } from '@/lib/crop-plan-weather';
import { formatMemoryForPrompt, type Fact } from '@/lib/memory';
import type { Milestone } from '@/lib/types/crop-plan';
import { mirrorCropPlanToS3, deleteCropPlanFromS3, tryMirror } from '@/lib/farmer-s3-store';
import { getSuitableCrops, type SoilSnapshot } from '@/lib/crop-suitability';
import { getCropInfo } from '@/lib/crop-info';
import { localizePlans, type PlanLocale } from '@/lib/crop-plan-translate';

// Plan generation makes a large LLM call; allow up to 60s on Vercel.
export const maxDuration = 60;

/** Best-effort 16-day forecast for the farmer's saved land centroid. */
async function getFarmerForecast(profile: Record<string, unknown> | null): Promise<ForecastDay[]> {
  try {
    const coords = profile?.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
    if (!coords?.length) return [];
    const { lat, lng } = extractCentroid(coords);
    return await get15DayForecast(lat, lng);
  } catch (e) {
    console.error('Crop-plan forecast fetch failed:', e);
    return [];
  }
}

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const plans = await queryItems({
    TableName: Tables.CROP_PLANS,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmer.farmerId },
    ScanIndexForward: false,
    Limit: 20,
  });

  const localeParam = req.nextUrl.searchParams.get('locale');
  const locale: PlanLocale = localeParam === 'hi' || localeParam === 'ta' ? localeParam : 'en';
  const localized = await localizePlans(plans, locale);

  return NextResponse.json(localized);
}

export async function DELETE(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const planId = req.nextUrl.searchParams.get('planId');
  if (!planId) return NextResponse.json({ error: 'Plan ID is required' }, { status: 400 });

  try {
    await deleteItem(Tables.CROP_PLANS, {
      farmer_id: farmer.farmerId,
      plan_id: planId,
    });
    await tryMirror('crop plan delete', () => deleteCropPlanFromS3(farmer.farmerId, planId));
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Crop plan delete error:', err);
    return NextResponse.json({ error: 'Plan delete failed' }, { status: 500 });
  }
}

const GeneratePlanSchema = z.object({
  // Optional for "not sure what to grow" — the AI picks the crop in that flow.
  cropName: z.string().optional(),
  farmerState: z.enum(['planning_unsure', 'planning_specific', 'mid_grow']),
  currentCropInfo: z.string().optional(),
  assessment: z.record(z.string()).optional(),
  // Date the farmer plans to start (anchor for milestone scheduling).
  startDate: z.string().optional(),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
}).superRefine((val, ctx) => {
  if (val.farmerState !== 'planning_unsure' && !val.cropName?.trim()) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cropName'], message: 'cropName is required' });
  }
});

// Human-readable labels for the assessment answers collected by the modal.
const ASSESSMENT_LABELS: Record<string, string> = {
  experience: 'Farming experience',
  grownBefore: 'Grown crops on this land before',
  previousCrops: 'Previous crops on this land',
  lastGrownWhen: 'Last grown',
  lastHarvest: 'Last harvest quality',
  pastIssues: 'Past problems faced',
  irrigation: 'Irrigation source',
  fertilizers: 'Fertilizers used',
  // Mid-season (currently-growing) details.
  currentStage: 'Current crop stage',
  sowedWhen: 'Time since sowing/planting',
  cropHealth: 'Current crop health',
  symptoms: 'Visible problems/symptoms',
};

function formatAssessment(a?: Record<string, string>): string {
  if (!a) return '';
  const lines = Object.entries(a)
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `- ${ASSESSMENT_LABELS[k] ?? k}: ${v}`);
  return lines.length
    ? `\n\nFarmer's land & experience assessment (use this to customize the plan — choose crops/inputs/schedule that fit their experience level, irrigation, soil history and past issues):\n${lines.join('\n')}`
    : '';
}

// Lightweight crop suggestion card for the "not sure what to grow" flow. It has
// no milestones — the full plan is generated only when the farmer picks one.
interface CropSuggestionSummary {
  cropName: string;
  reason: string;
  season: string;
  estimatedRevenue: string;
  totalBudgetEstimate: number;
  startDate: string;
  milestones: Milestone[];
  harvestDate: string;
  sellWindow: string;
  storageNotes: string;
}

interface SuggestionContext {
  profile: Record<string, unknown> | null;
  soilData: Record<string, unknown> | undefined;
  soilContext: string;
  assessmentText: string;
  forecastBlock: string;
  outputLanguage: string;
  locale: 'en' | 'hi' | 'ta';
  startDate: string;
}

function toSuggestionSummary(c: unknown, startDate: string): CropSuggestionSummary | null {
  if (!c || typeof c !== 'object') return null;
  const crop = c as Record<string, unknown>;
  const name = crop.cropName ?? crop.crop_name;
  if (!name || !String(name).trim()) return null;
  return {
    cropName: String(name).trim(),
    reason: String(crop.reason ?? ''),
    season: String(crop.season ?? ''),
    estimatedRevenue: String(crop.estimatedRevenue ?? crop.estimated_revenue ?? ''),
    totalBudgetEstimate: Number(crop.totalBudgetEstimate ?? crop.budgetEstimate ?? crop.budget_estimate ?? 0) || 0,
    startDate,
    milestones: [],
    harvestDate: '',
    sellWindow: '',
    storageNotes: '',
  };
}

// Deterministic shortlist (district + soil scoring) used when the AI call fails.
function fallbackSuggestions(ctx: SuggestionContext): CropSuggestionSummary[] {
  const { profile, soilData, locale, startDate } = ctx;
  const soil: SoilSnapshot | null = soilData ? {
    ph: soilData.ph as SoilSnapshot['ph'],
    nitrogen: soilData.nitrogen as SoilSnapshot['nitrogen'],
    phosphorus: soilData.phosphorus as SoilSnapshot['phosphorus'],
    potassium: soilData.potassium as SoilSnapshot['potassium'],
    organicCarbon: soilData.organic_carbon as SoilSnapshot['organicCarbon'],
  } : null;
  const address = profile?.address as string | undefined;
  return getSuitableCrops(address, soil).slice(0, 3).map((c) => {
    const info = getCropInfo(c.cropName);
    return {
      cropName: c.cropName,
      reason: c.reason,
      season: info ? info.season[locale] : '',
      estimatedRevenue: '',
      totalBudgetEstimate: 0,
      startDate,
      milestones: [],
      harvestDate: '',
      sellWindow: '',
      storageNotes: '',
    };
  });
}

// Ask the AI for the 3 best crops for this farmer's land/soil/season, falling
// back to the deterministic suitability engine if the AI call fails.
async function suggestCrops(ctx: SuggestionContext): Promise<CropSuggestionSummary[]> {
  const { profile, soilContext, assessmentText, forecastBlock, outputLanguage, startDate } = ctx;

  const prompt = `Recommend the best crops for a Tamil Nadu farmer who is unsure what to grow:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Land type/topography from DB: ${profile?.typography ?? 'general land'}
         - Farmer address from DB: ${profile?.address ?? 'unknown'}
         - Soil report from DB:
${soilContext}
         - Farmer wants to start around: ${startDate}${assessmentText}${forecastBlock}

         Write every farmer-facing text value (cropName, reason, season, estimatedRevenue) in ${outputLanguage}.
         Keep JSON keys, numbers, and currency digits in standard format.

         Using the district (from the address), the soil report, the season/forecast, and the farmer's experience and irrigation above, choose the 3 most suitable, realistic and profitable crops to start around ${startDate}. Prefer crops that fit the soil and water situation and that the farmer can manage at their experience level.
         Return JSON only:
         {
           "suggestedCrops": [
             {
               "cropName": "...",
               "reason": "1-2 sentences on why this crop suits THIS farmer's land, soil, water and season",
               "season": "the season/window it fits (e.g. Kharif / Samba / Rabi)",
               "estimatedRevenue": "approx revenue range for their land size, e.g. ₹45,000–₹60,000",
               "totalBudgetEstimate": number (approx total input cost in INR for their land size)
             }
           ]
         }
         Return exactly 3 crops and only valid JSON.`;

  try {
    const res = await chatWithBedrock(
      [{ role: 'user', content: prompt }],
      `You are FarmAdvisor, an expert Tamil Nadu agricultural planner. Return one valid JSON object only. Recommend crops that realistically fit the farmer's district, soil, water and season. Write farmer-facing text in ${outputLanguage}. Do not invent soil values, prices or weather not provided.`,
      { json: true, maxTokens: 1500 }
    );
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(res);
    } catch {
      const m = res.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : {};
    }
    const raw = Array.isArray(parsed.suggestedCrops) ? parsed.suggestedCrops : [];
    const mapped = raw
      .map((c) => toSuggestionSummary(c, startDate))
      .filter((c): c is CropSuggestionSummary => c !== null)
      .slice(0, 3);
    if (mapped.length) return mapped;
  } catch (err) {
    console.error('Crop suggestion AI failed, using rule-based shortlist:', err);
  }

  return fallbackSuggestions(ctx);
}

// Normalize the various LLM JSON shapes into the CropPlan the UI expects.
function normalizePlan(
  p: Record<string, unknown> | undefined | null,
  startDate: string,
  fallbackCropName?: string
): NormalizedPlan | null {
  const cropName = p?.cropName ?? p?.crop_name ?? fallbackCropName;
  if (!p || !cropName) return null;
  return {
    cropName: String(cropName),
    startDate: String(p.startDate ?? p.start_date ?? startDate),
    milestones: (p.milestones ?? p.remainingMilestones ?? []) as Milestone[],
    totalBudgetEstimate: Number(p.totalBudgetEstimate ?? p.budgetEstimate ?? p.budget_estimate ?? 0),
    harvestDate: String(p.harvestDate ?? p.harvest_date ?? ''),
    sellWindow: String(p.sellWindow ?? p.sell_window ?? ''),
    storageNotes: String(p.storageNotes ?? p.storage_notes ?? ''),
  };
}

interface NormalizedPlan {
  cropName: string;
  startDate: string;
  milestones: Milestone[];
  totalBudgetEstimate: number;
  harvestDate: string;
  sellWindow: string;
  storageNotes: string;
}

function addDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function formatSoilReportContext(soilData: Record<string, unknown> | undefined) {
  if (!soilData) return 'No soil report is available.';

  const micronutrients = soilData.micronutrients && typeof soilData.micronutrients === 'object'
    ? Object.entries(soilData.micronutrients as Record<string, unknown>)
        .map(([name, value]) => `${name}: ${value ?? 'unknown'}`)
        .join(', ')
    : '';
  const keyFindings = Array.isArray(soilData.key_findings)
    ? soilData.key_findings.filter(Boolean).join('; ')
    : '';

  return [
    `pH: ${soilData.ph ?? 'unknown'}`,
    `EC/salinity: ${soilData.electrical_conductivity ?? 'unknown'}`,
    `Organic carbon: ${soilData.organic_carbon ?? 'unknown'}`,
    `Nitrogen: ${soilData.nitrogen ?? 'unknown'}`,
    `Phosphorus: ${soilData.phosphorus ?? 'unknown'}`,
    `Potassium: ${soilData.potassium ?? 'unknown'}`,
    micronutrients ? `Micronutrients: ${micronutrients}` : '',
    soilData.plain_language_summary ? `Farmer-friendly soil summary: ${soilData.plain_language_summary}` : '',
    keyFindings ? `Key soil findings: ${keyFindings}` : '',
    soilData.recommendations ? `Soil recommendations: ${soilData.recommendations}` : '',
  ].filter(Boolean).join('\n');
}

const FALLBACK_SOIL_NOTE: Record<'en' | 'hi' | 'ta', string> = {
  en: 'No soil report is available, so confirm nutrient dose locally before applying fertilizer.',
  hi: 'कोई मिट्टी रिपोर्ट उपलब्ध नहीं है, इसलिए उर्वरक डालने से पहले स्थानीय रूप से पोषक तत्व की मात्रा की पुष्टि करें।',
  ta: 'மண் அறிக்கை எதுவும் கிடைக்கவில்லை, எனவே உரம் இடுவதற்கு முன் உள்ளூர் அளவில் ஊட்டச்சத்து அளவை உறுதிப்படுத்தவும்.',
};

const FALLBACK_SOIL_REPORT_LABEL: Record<'en' | 'hi' | 'ta', string> = {
  en: 'Current soil report details:',
  hi: 'वर्तमान मिट्टी रिपोर्ट विवरण:',
  ta: 'தற்போதைய மண் அறிக்கை விவரங்கள்:',
};

const FALLBACK_WEATHER_REQUIREMENT: Record<'en' | 'hi' | 'ta', string> = {
  en: 'Avoid heavy rain, waterlogging, and strong wind during field operations. Prefer mild weather with workable soil moisture.',
  hi: 'खेत के काम के दौरान भारी बारिश, जलभराव और तेज हवा से बचें। हल्के मौसम और काम करने योग्य मिट्टी की नमी को प्राथमिकता दें।',
  ta: 'வயல் வேலைகளின் போது கனமழை, நீர் தேங்குதல் மற்றும் பலத்த காற்றைத் தவிர்க்கவும். மிதமான வானிலை மற்றும் வேலை செய்யக்கூடிய மண் ஈரப்பதத்தை விரும்பவும்.',
};

function fallbackStorageNotes(crop: string, locale: 'en' | 'hi' | 'ta'): string {
  if (locale === 'hi') return `उचित सुखाने के बाद ${crop} को साफ, सूखे बैग या कंटेनर में स्टोर करें। उपज को नमी और कीटों से दूर रखें।`;
  if (locale === 'ta') return `சரியாக உலர்த்திய பிறகு ${crop} ஐ சுத்தமான, உலர்ந்த பைகள் அல்லது கொள்கலன்களில் சேமிக்கவும். விளைபொருளை ஈரப்பதம் மற்றும் பூச்சிகளிலிருந்து விலக்கி வைக்கவும்.`;
  return `Store ${crop} in clean, dry bags or containers after proper drying. Keep produce away from moisture and pests.`;
}

function fallbackStages(crop: string, soilNote: string, locale: 'en' | 'hi' | 'ta') {
  if (locale === 'hi') return [
    { label: 'भूमि तैयारी', summary: 'जुताई करें, समतल करें और खेत तैयार करने के लिए खाद डालें।', offset: 0, days: 7, cost: 12000, task: `${crop} के लिए खरपतवार हटाएं, खेत की जुताई करें, ढेलों को तोड़ें और भूमि को समतल करें। अच्छी तरह सड़ी हुई गोबर खाद डालें और खेत की ढलान के अनुसार जल निकासी सुधारें। ${soilNote}` },
    { label: 'बीज चयन और उपचार', summary: 'स्वस्थ बीज खरीदें और बुवाई से पहले उपचारित करें।', offset: 7, days: 2, cost: 3500, task: `विश्वसनीय स्रोत से स्वस्थ ${crop} बीज खरीदें। बुवाई से पहले बीज को अनुशंसित जैव-उर्वरक या फफूंदनाशक से उपचारित करें, और गैप भरने के लिए पर्याप्त बीज रखें।` },
    { label: 'बुवाई', summary: 'सही दूरी पर बुवाई करें और मिट्टी को नम रखें।', offset: 9, days: 3, cost: 9000, task: `अपनी स्थानीय किस्म के लिए सही दूरी पर ${crop} की बुवाई करें। अंकुरण के दौरान मिट्टी को नम रखें, भारी बारिश से पहले बुवाई से बचें, और आसान निराई के लिए पंक्तियों को स्पष्ट रूप से चिह्नित करें।` },
    { label: 'सिंचाई और खरपतवार नियंत्रण', summary: 'हल्की सिंचाई करें और शुरुआत में ही खरपतवार हटाएं।', offset: 12, days: 21, cost: 8500, task: `मिट्टी की नमी के अनुसार हल्की, नियमित सिंचाई बनाए रखें। विशेष रूप से पहले तीन हफ्तों में खरपतवार जल्दी हटाएं, ताकि ${crop} पोषक तत्वों के लिए प्रतिस्पर्धा न करे।` },
    { label: 'पोषक तत्व और कीट प्रबंधन', summary: 'विभाजित मात्रा में उर्वरक डालें और कीटों पर नज़र रखें।', offset: 33, days: 28, cost: 14500, task: `मिट्टी की रिपोर्ट और फसल की वृद्धि के आधार पर पोषक तत्वों को विभाजित मात्रा में डालें। सप्ताह में दो बार पत्तियों, तनों और फूलों का निरीक्षण करें, और लक्षण दिखने पर ही जैविक या अनुशंसित रासायनिक नियंत्रण का उपयोग करें।` },
    { label: 'कटाई और बिक्री', summary: 'पकने पर कटाई करें, सुखाएं, छांटें और बेचें।', offset: 61, days: 14, cost: 10000, task: `जब फसल परिपक्व हो जाए और नमी उपयुक्त हो तब ${crop} की कटाई करें। बेचने से पहले उपज को साफ तरीके से सुखाएं, छांटें और भंडारित करें, सबसे अच्छे स्थानीय बाजार के समय के दौरान बेचें।` },
  ];
  if (locale === 'ta') return [
    { label: 'நில தயாரிப்பு', summary: 'வயலை உழுது, சமன் செய்து, உரம் சேர்க்கவும்.', offset: 0, days: 7, cost: 12000, task: `${crop} க்காக களைகளை அகற்றி, வயலை உழுது, மண் கட்டிகளை உடைத்து, நிலத்தை சமன் செய்யவும். நன்கு மக்கிய தொழு உரத்தை சேர்த்து, வயல் சரிவுக்கு ஏற்ப வடிகால் மேம்படுத்தவும். ${soilNote}` },
    { label: 'விதை தேர்வு மற்றும் சிகிச்சை', summary: 'நல்ல விதைகளை வாங்கி விதைப்பதற்கு முன் சிகிச்சை செய்யவும்.', offset: 7, days: 2, cost: 3500, task: `நம்பகமான மூலத்திலிருந்து ஆரோக்கியமான ${crop} விதைகளை வாங்கவும். விதைப்பதற்கு முன் பரிந்துரைக்கப்பட்ட உயிர் உரம் அல்லது பூஞ்சைக்கொல்லியால் விதையை சிகிச்சை செய்யவும், இடைவெளி நிரப்புவதற்கு போதுமான விதைகளை வைத்திருங்கள்.` },
    { label: 'விதைப்பு', summary: 'சரியான இடைவெளியில் விதைத்து மண்ணை ஈரமாக வைக்கவும்.', offset: 9, days: 3, cost: 9000, task: `உங்கள் உள்ளூர் வகைக்கு ஏற்ற சரியான இடைவெளியில் ${crop} ஐ விதைக்கவும். முளைக்கும் போது மண்ணை ஈரமாக வைக்கவும், கனமழைக்கு முன் விதைப்பதைத் தவிர்க்கவும், எளிதான களை எடுப்புக்காக வரிசைகளை தெளிவாக குறிக்கவும்.` },
    { label: 'நீர்ப்பாசனம் மற்றும் களை கட்டுப்பாடு', summary: 'லேசாக நீர் பாய்ச்சி, ஆரம்பத்திலேயே களைகளை அகற்றவும்.', offset: 12, days: 21, cost: 8500, task: `மண் ஈரப்பதத்திற்கு ஏற்ப லேசான, தொடர்ச்சியான நீர்ப்பாசனத்தை பராமரிக்கவும். குறிப்பாக முதல் மூன்று வாரங்களில் களைகளை விரைவில் அகற்றவும், இதனால் ${crop} ஊட்டச்சத்துக்களுக்காக போட்டியிடாது.` },
    { label: 'ஊட்டச்சத்து மற்றும் பூச்சி மேலாண்மை', summary: 'பிரிக்கப்பட்ட அளவில் உரம் இடவும், பூச்சிகளை கவனிக்கவும்.', offset: 33, days: 28, cost: 14500, task: `மண் அறிக்கை மற்றும் பயிர் வளர்ச்சியின் அடிப்படையில் ஊட்டச்சத்துக்களை பிரிக்கப்பட்ட அளவுகளில் இடவும். வாரத்திற்கு இரண்டு முறை இலைகள், தண்டுகள் மற்றும் பூக்களை ஆய்வு செய்யவும், அறிகுறிகள் தென்படும்போது மட்டுமே உயிரியல் அல்லது பரிந்துரைக்கப்பட்ட இரசாயன கட்டுப்பாட்டைப் பயன்படுத்தவும்.` },
    { label: 'அறுவடை மற்றும் விற்பனை', summary: 'முதிர்ச்சியடைந்தவுடன் அறுவடை செய்து, உலர்த்தி, தரம் பிரித்து விற்கவும்.', offset: 61, days: 14, cost: 10000, task: `பயிர் முதிர்ச்சியடைந்து ஈரப்பதம் பொருத்தமாக இருக்கும்போது ${crop} ஐ அறுவடை செய்யவும். சிறந்த உள்ளூர் சந்தை காலத்தில் விற்பதற்கு முன் விளைபொருளை சுத்தமாக உலர்த்தி, தரம் பிரித்து, சேமிக்கவும்.` },
  ];
  return [
    { label: 'Land Preparation', summary: 'Plough, level and add manure to ready the field.', offset: 0, days: 7, cost: 12000, task: `Clear weeds, plough the field, break clods, and level the land for ${crop}. Add well-decomposed farmyard manure and improve drainage based on the field slope. ${soilNote}` },
    { label: 'Seed Selection and Treatment', summary: 'Buy healthy seed and treat it before sowing.', offset: 7, days: 2, cost: 3500, task: `Buy healthy ${crop} seed from a reliable source. Treat seed with recommended biofertilizer or fungicide before sowing, and keep enough seed for gap filling.` },
    { label: 'Sowing', summary: 'Sow at correct spacing and keep soil moist.', offset: 9, days: 3, cost: 9000, task: `Sow ${crop} at the right spacing for your local variety. Keep soil moist during germination, avoid sowing before heavy rain, and mark rows clearly for easy weeding.` },
    { label: 'Irrigation and Weed Control', summary: 'Water lightly and remove weeds early.', offset: 12, days: 21, cost: 8500, task: `Maintain light, regular irrigation according to soil moisture. Remove weeds early, especially during the first three weeks, so ${crop} does not compete for nutrients.` },
    { label: 'Nutrient and Pest Management', summary: 'Apply split fertilizer and watch for pests.', offset: 33, days: 28, cost: 14500, task: `Apply nutrients in split doses based on the soil report and crop growth. Inspect leaves, stems, and flowers twice a week, and use biological or recommended chemical control only when symptoms are seen.` },
    { label: 'Harvesting and Selling', summary: 'Harvest at maturity, dry, grade and sell.', offset: 61, days: 14, cost: 10000, task: `Harvest ${crop} when the crop reaches maturity and moisture is suitable. Dry, grade, and store the produce cleanly before selling during the best local market window.` },
  ];
}

function buildFallbackPlan(
  cropName: string,
  startDate: string,
  profile: Record<string, unknown> | null,
  soilData: Record<string, unknown> | undefined,
  locale: 'en' | 'hi' | 'ta' = 'en'
): NormalizedPlan {
  const acres = Number(profile?.land_area_acres ?? 1) || 1;
  const crop = cropName.trim();
  const soilNote = soilData
    ? `${FALLBACK_SOIL_REPORT_LABEL[locale]}\n${formatSoilReportContext(soilData)}`
    : FALLBACK_SOIL_NOTE[locale];
  const stages = fallbackStages(crop, soilNote, locale);

  const milestones = stages.map((stage, index) => ({
    id: String(index + 1),
    label: stage.label,
    summary: stage.summary,
    date: addDays(startDate, stage.offset),
    endDate: addDays(startDate, stage.offset + stage.days),
    durationDays: stage.days,
    tasks: stage.task,
    estimatedCost: Math.round(stage.cost * acres),
    weatherRequirement: FALLBACK_WEATHER_REQUIREMENT[locale],
  }));

  return {
    cropName: crop,
    startDate,
    milestones,
    totalBudgetEstimate: milestones.reduce((sum, stage) => sum + stage.estimatedCost, 0),
    harvestDate: addDays(startDate, 75),
    sellWindow: `${addDays(startDate, 76)} to ${addDays(startDate, 90)}`,
    storageNotes: fallbackStorageNotes(crop, locale),
  };
}

async function persistPlan(
  farmerId: string,
  plan: NormalizedPlan,
  status: string,
  currentStage: string | null,
  inputDetails?: Record<string, unknown>,
  // When provided, the existing plan is updated in place (same id) instead of a
  // new copy being created. This is what makes an "edit" stay on the same plan.
  planId?: string,
  // Language the milestone/crop text in `plan` is actually written in. Recorded
  // so the read path knows when it needs to translate for the farmer's current
  // UI language (see lib/crop-plan-translate.ts).
  contentLocale?: 'en' | 'hi' | 'ta'
) {
  const alertStages = plan.milestones.filter((m) => m.alert).map((m) => m.label);
  const now = new Date().toISOString();

  // Defaults for a brand-new plan.
  let createdAt = now;
  let effectiveStatus = status;
  let effectiveStage = currentStage;
  let effectiveInputDetails = inputDetails ?? {};
  let activeFrom: string | undefined;
  let existing: Record<string, unknown> | null = null;

  // Editing an existing plan: keep its id and preserve fields the edit payload
  // doesn't carry (creation time, active status/date, current stage, assessment).
  if (planId) {
    existing = await getItem(Tables.CROP_PLANS, { farmer_id: farmerId, plan_id: planId });
    if (existing) {
      createdAt = (existing.created_at as string) ?? now;
      effectiveStatus = (existing.status as string) ?? status;
      activeFrom = existing.active_from as string | undefined;
      effectiveStage = currentStage ?? ((existing.current_stage as string | null) ?? null);
      if (!inputDetails || Object.keys(inputDetails).length === 0) {
        effectiveInputDetails = (existing.input_details as Record<string, unknown>) ?? {};
      }
    }
  }

  const item = {
    farmer_id: farmerId,
    plan_id: planId ?? generateId(),
    crop_name: plan.cropName,
    start_date: plan.startDate,
    milestones: plan.milestones,
    harvest_date: plan.harvestDate,
    sell_window: plan.sellWindow,
    storage_notes: plan.storageNotes,
    budget_estimate: plan.totalBudgetEstimate,
    status: effectiveStatus,
    current_stage: effectiveStage,
    input_details: effectiveInputDetails,
    weather_alerts: alertStages,
    active_from: activeFrom, // undefined is stripped by removeUndefinedValues
    created_at: createdAt,
    updated_at: now,
    content_locale: contentLocale ?? (existing?.content_locale as string | undefined) ?? 'en',
    // The saved text just changed (new/edited content) — any cached translations
    // from before this edit no longer match, so drop them rather than serve stale text.
    translations: contentLocale ? {} : ((existing?.translations as Record<string, unknown> | undefined) ?? {}),
  };
  await putItem(Tables.CROP_PLANS, item);
  await tryMirror('crop plan save', () => mirrorCropPlanToS3(item));
  return item;
}

const SavePlanSchema = z.object({
  action: z.literal('save'),
  // When present, update this existing plan in place instead of creating a copy.
  planId: z.string().optional(),
  plan: z.object({
    cropName: z.string(),
    startDate: z.string().optional(),
    milestones: z.array(z.any()).default([]),
    totalBudgetEstimate: z.number().default(0),
    harvestDate: z.string().default(''),
    sellWindow: z.string().default(''),
    storageNotes: z.string().default(''),
  }),
  inputDetails: z.record(z.unknown()).optional(),
  // Language the saved plan text is written in (e.g. after an AI-assisted edit
  // produced localized text). Optional — omitted when the edit doesn't change language.
  locale: z.enum(['en', 'hi', 'ta']).optional(),
});

const ActivatePlanSchema = z.object({
  action: z.literal('activate'),
  planId: z.string().min(1),
});

const DeactivatePlanSchema = z.object({
  action: z.literal('deactivate'),
  planId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // Branch: persist a plan the farmer selected from AI suggestions.
    if (body?.action === 'save') {
      const { plan, inputDetails, planId, locale: savedLocale } = SavePlanSchema.parse(body);
      const today = new Date().toISOString().split('T')[0];
      const savedPlan = await persistPlan(
        farmer.farmerId,
        { ...plan, startDate: plan.startDate ?? today } as NormalizedPlan,
        'planned',
        null,
        inputDetails,
        planId,
        savedLocale
      );
      return NextResponse.json({ success: true, savedPlan });
    }

    if (body?.action === 'activate') {
      const { planId } = ActivatePlanSchema.parse(body);
      const activeFrom = new Date().toISOString().split('T')[0];
      await updateItem({
        TableName: Tables.CROP_PLANS,
        Key: { farmer_id: farmer.farmerId, plan_id: planId },
        UpdateExpression: 'SET #s = :s, active_from = :af, updated_at = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'active',
          ':af': activeFrom,
          ':u': new Date().toISOString(),
        },
      });
      const updated = await getItem(Tables.CROP_PLANS, { farmer_id: farmer.farmerId, plan_id: planId });
      if (updated) await tryMirror('crop plan activate', () => mirrorCropPlanToS3(updated));

      return NextResponse.json({ success: true });
    }

    if (body?.action === 'deactivate') {
      const { planId } = DeactivatePlanSchema.parse(body);
      await updateItem({
        TableName: Tables.CROP_PLANS,
        Key: { farmer_id: farmer.farmerId, plan_id: planId },
        UpdateExpression: 'SET #s = :s, updated_at = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': 'planned',
          ':u': new Date().toISOString(),
        },
      });
      const updated = await getItem(Tables.CROP_PLANS, { farmer_id: farmer.farmerId, plan_id: planId });
      if (updated) await tryMirror('crop plan deactivate', () => mirrorCropPlanToS3(updated));

      return NextResponse.json({ success: true });
    }

    const data = GeneratePlanSchema.parse(body);
    const assessmentText = formatAssessment(data.assessment);
    const outputLanguage =
      data.locale === 'ta' ? 'Tamil' :
      data.locale === 'hi' ? 'Hindi' :
      'English';

    const [profile, soilReports] = await Promise.all([
      getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
      queryItems({
        TableName: Tables.SOIL_REPORTS,
        KeyConditionExpression: 'farmer_id = :fid',
        ExpressionAttributeValues: { ':fid': farmer.farmerId },
        ScanIndexForward: false,
        Limit: 1,
      }),
    ]);

    const soilData = soilReports[0];
    const soilContext = formatSoilReportContext(soilData);
    const memoryContext = formatMemoryForPrompt(profile?.memory as Fact[] | undefined);
    const today = new Date().toISOString().split('T')[0];
    const startDate = data.startDate || today;
    const forecast = await getFarmerForecast(profile);
    const forecastBlock = forecast.length
      ? `\n\n16-day weather forecast for the farmer's land (use this to schedule weather-sensitive stages — sowing, spraying, fertilizing, harvesting — away from heavy rain/storm days where possible):\n${forecastSummaryForPrompt(forecast)}`
      : '';

    // "Not sure what to grow": return a lightweight 3-crop shortlist for the
    // farmer to choose from. The full detailed plan is generated only once they
    // pick a crop (via a normal planning_specific request).
    if (data.farmerState === 'planning_unsure') {
      const suggestedCrops = await suggestCrops({
        profile,
        soilData,
        soilContext,
        assessmentText,
        forecastBlock,
        outputLanguage,
        locale: data.locale,
        startDate,
      });
      return NextResponse.json({ planData: { suggestedCrops } });
    }

    // Every remaining flow names a crop (enforced by the schema).
    const cropName = data.cropName as string;

    // Shared instruction: every milestone must be detailed, dated as a range
    // anchored on the farmer's chosen start date, and say exactly what to do.
    const milestoneSpec = `Each milestone object MUST have:
           {
             "id": "1",
             "label": "short stage name",
             "summary": "ONE short at-a-glance sentence (max ~12 words) a farmer can read in 2 seconds, e.g. 'Plough, level and add manure to ready the field'",
             "date": "YYYY-MM-DD (stage start)",
             "endDate": "YYYY-MM-DD (stage end)",
             "durationDays": number,
             "tasks": "detailed, step-by-step actions the farmer should perform in this stage — what to do, quantities, inputs, and how (write 2-4 sentences or '- ' bullets)",
             "estimatedCost": number (INR),
             "weatherRequirement": "the ideal weather for this stage and what to avoid"
           }
         Rules:
         - The FIRST stage starts on ${startDate}. Every later stage's "date" follows the previous stage's "endDate" with no gaps/overlaps.
         - Produce 6-10 well-sequenced stages from land preparation through to selling.
         - Keep all dates consistent with durationDays and the ${startDate} anchor.
         - Keep text farmer-friendly and actionable. Avoid vague tasks like "monitor regularly" unless you say what to check and what action to take.
         - Return JSON only. Do not wrap it in markdown.`;

    const planPrompt = data.farmerState === 'planning_specific'
      ? `Validate and create a detailed crop plan for growing ${cropName} for a Tamil Nadu farmer:
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Land type/topography from DB: ${profile?.typography ?? 'general land'}
         - Farmer address from DB: ${profile?.address ?? 'unknown'}
         - Soil report from DB:
${soilContext}
         - Today: ${today}
         - Farmer wants to start on: ${startDate}${assessmentText}${forecastBlock}

         Write every farmer-facing text value in ${outputLanguage}: cropName, suitabilityReason, adjustments, milestone labels, summaries, tasks, weatherRequirement, sellWindow, and storageNotes.
         Keep JSON keys, dates, IDs, numbers, and currency values in English/standard format.

         First check whether ${cropName} can realistically grow in this farmer's area/land/soil using the DB details above.
         If suitable, create the plan. If only conditionally suitable, still create the plan but include required adjustments.
         Use the soil report to customize land preparation, organic matter improvement, fertilizer planning, micronutrient correction, irrigation/salinity cautions, nutrient management, and pest/disease prevention stages. Do not invent soil values that are not in the report.
         Return JSON:
         {
           "suitable": true,
           "suitabilityReason": "...",
           "adjustments": "...",
           "plan": {
             "cropName": "${cropName}",
             "startDate": "${startDate}",
             "milestones": [ ...detailed milestones... ],
             "totalBudgetEstimate": 0,
             "harvestDate": "YYYY-MM-DD",
             "sellWindow": "...",
             "storageNotes": "..."
           }
         }
         ${milestoneSpec}
         Return only valid JSON.`
      : `Assess current growing status for this farmer who is mid-season:
         - Selected crop: ${cropName}
         - Crop info: ${data.currentCropInfo ?? 'unknown'}
         - Land: ${profile?.land_area_acres ?? 'unknown'} acres
         - Land type/topography from DB: ${profile?.typography ?? 'general land'}
         - Farmer address from DB: ${profile?.address ?? 'unknown'}
         - Soil report from DB:
${soilContext}
         - Today: ${today}${assessmentText}${forecastBlock}

         Write every farmer-facing text value in ${outputLanguage}: cropName, currentStage, milestone labels, summaries, tasks, weatherRequirement, sellWindow, storageNotes, and immediateAction.
         Keep JSON keys, dates, IDs, numbers, and currency values in English/standard format.

         First check whether ${cropName} can realistically grow in this farmer's area/land/soil using the DB details above.
         If suitable, create a remaining-stage plan for the selected crop. If conditionally suitable, include corrective adjustments in the tasks.
         Use the soil report to customize immediate action, organic matter improvement, fertilizer planning, micronutrient correction, irrigation/salinity cautions, nutrient management, and pest/disease prevention stages. Do not invent soil values that are not in the report.

         Return a JSON plan with the REMAINING stages from today onward and current status:
         {
           "cropName": "${cropName}",
           "currentStage": "...",
           "startDate": "${today}",
           "remainingMilestones": [ ...detailed milestones, first one starting today... ],
           "harvestDate": "YYYY-MM-DD",
           "sellWindow": "...",
           "storageNotes": "...",
           "immediateAction": "..."
         }
         ${milestoneSpec}
         Return only valid JSON.`;

    let llmResponse = '';
    let planData: Record<string, unknown>;
    try {
      llmResponse = await chatWithBedrock(
        [{ role: 'user', content: planPrompt }],
        `You are FarmAdvisor, an expert Tamil Nadu agricultural planner.
Return one valid JSON object only.
Use the farmer profile, soil data, assessment, and forecast exactly as provided.
Write farmer-facing text in ${outputLanguage}.
Do not invent unavailable soil values, land details, market prices, or weather data.
Make the plan practical for a farmer to execute in the field.${memoryContext ? `\n\n${memoryContext}\n(Use these known facts about the farmer to tailor crop choice, inputs, and schedule.)` : ''}`,
        // Detailed multi-stage plans are large; JSON mode + a high token cap keep
        // the response complete and parseable.
        { json: true, maxTokens: 7000 }
      );

      // JSON mode returns a clean object; fall back to brace extraction otherwise.
      try {
        planData = JSON.parse(llmResponse);
      } catch {
        const jsonMatch = llmResponse.match(/\{[\s\S]*\}/);
        planData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      }
    } catch (err) {
      console.error('Crop plan AI generation failed, using fallback plan:', err);
      planData = {
        suitable: true,
        suitabilityReason: `${cropName} can be planned using the farmer profile and soil details available in the database.`,
        adjustments: 'Confirm exact seed variety and fertilizer dose with local advisory before field application.',
        plan: buildFallbackPlan(cropName, startDate, profile, soilData, data.locale),
      };
    }

    const suggestedCrops = Array.isArray(planData.suggestedCrops) ? planData.suggestedCrops : [];
    const matchingSuggestion = suggestedCrops.find((crop) => {
      if (!crop || typeof crop !== 'object') return false;
      const candidate = (crop as Record<string, unknown>).cropName ?? (crop as Record<string, unknown>).crop_name;
      return String(candidate ?? '').toLowerCase() === cropName.toLowerCase();
    }) as Record<string, unknown> | undefined;
    let rawPlan = (planData.plan ?? matchingSuggestion ?? planData) as Record<string, unknown>;
    if (!rawPlan.milestones && !rawPlan.remainingMilestones) {
      rawPlan = buildFallbackPlan(cropName, startDate, profile, soilData, data.locale) as unknown as Record<string, unknown>;
      planData.plan = rawPlan;
    }
    const normalized = normalizePlan(rawPlan, startDate, cropName);
    if (normalized) {
      normalized.milestones = annotateMilestonesWithWeather(normalized.milestones, forecast);
      planData.plan = normalized;
      const inputDetails = {
        farmerState: data.farmerState,
        selectedCrop: cropName,
        currentCropInfo: data.currentCropInfo ?? '',
        assessment: data.assessment ?? {},
        startDate,
      };
      planData.inputDetails = inputDetails;
      const savedPlan = await persistPlan(
        farmer.farmerId,
        normalized,
        data.farmerState === 'mid_grow' ? 'active' : 'planned',
        (planData.currentStage as string) ?? null,
        inputDetails,
        undefined,
        data.locale
      );
      planData.savedPlan = savedPlan;
    }

    return NextResponse.json({ planData, rawResponse: llmResponse });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Crop plan error:', err);
    return NextResponse.json({ error: 'Plan generation failed' }, { status: 500 });
  }
}
