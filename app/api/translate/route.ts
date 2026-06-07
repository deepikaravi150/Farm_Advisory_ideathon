import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { chatWithBedrock } from '@/lib/ai/openai';

const TranslateSchema = z.object({
  locale: z.enum(['en', 'hi', 'ta']),
  payload: z.unknown(),
  kind: z.enum(['crop_plan', 'soil_report', 'current_plan_details']).default('crop_plan'),
});

const LANGUAGE_NAME = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
} as const;

function replaceAllText(text: string, locale: 'hi' | 'ta') {
  const common: Array<[string, string, string]> = [
    ['Black gram', 'उड़द', 'உளுந்து'],
    ['Land Preparation', 'भूमि तैयारी', 'நிலத் தயாரிப்பு'],
    ['Seed Selection and Treatment', 'बीज चयन और उपचार', 'விதை தேர்வு மற்றும் நேர்த்தி'],
    ['Sowing', 'बुवाई', 'விதைப்பு'],
    ['Irrigation and Weed Control', 'सिंचाई और खरपतवार नियंत्रण', 'பாசனம் மற்றும் களை கட்டுப்பாடு'],
    ['Nutrient and Pest Management', 'पोषक तत्व और कीट प्रबंधन', 'ஊட்டச்சத்து மற்றும் பூச்சி மேலாண்மை'],
    ['Harvesting and Selling', 'कटाई और बिक्री', 'அறுவடை மற்றும் விற்பனை'],
    ['Rain showers', 'बारिश की बौछारें', 'மழை சாரல்'],
    ['rain showers', 'बारिश की बौछारें', 'மழை சாரல்'],
    ['Thunderstorm', 'आंधी-तूफान', 'இடி மின்னல் மழை'],
    ['thunderstorm', 'आंधी-तूफान', 'இடி மின்னல் மழை'],
    ['Overcast', 'बादल छाए रहेंगे', 'மேகமூட்டம்'],
    ['overcast', 'बादल छाए रहेंगे', 'மேகமூட்டம்'],
    ['Heavy drizzle', 'तेज फुहार', 'கனமான தூறல்'],
    ['heavy drizzle', 'तेज फुहार', 'கனமான தூறல்'],
    ['Drizzle', 'फुहार', 'தூறல்'],
    ['drizzle', 'फुहार', 'தூறல்'],
    ['Light drizzle', 'हल्की फुहार', 'லேசான தூறல்'],
    ['light drizzle', 'हल्की फुहार', 'லேசான தூறல்'],
    ['Partly Cloudy', 'आंशिक बादल', 'பகுதி மேகமூட்டம்'],
    ['partly cloudy', 'आंशिक बादल', 'பகுதி மேகமூட்டம்'],
    ['Cloudy', 'बादल', 'மேகமூட்டம்'],
    ['cloudy', 'बादल', 'மேகமூட்டம்'],
    ['Clear weeds, plough the field, break clods, and level the land for Black gram. Add well-decomposed farmyard manure and improve drainage based on the field slope. No soil report is available, so confirm nutrient dose locally before applying fertilizer.',
      'उड़द के लिए खरपतवार हटाएं, खेत की जुताई करें, ढेलों को तोड़ें और जमीन समतल करें। अच्छी तरह सड़ी हुई गोबर खाद डालें और खेत की ढलान के अनुसार जल निकासी सुधारें। मिट्टी रिपोर्ट उपलब्ध नहीं है, इसलिए खाद डालने से पहले स्थानीय स्तर पर पोषक मात्रा की पुष्टि करें।',
      'உளுந்துக்கு களைகளை அகற்றி, வயலை உழுது, கட்டிகளை உடைத்து நிலத்தை சமப்படுத்தவும். நன்றாக மக்கிய தொழு உரத்தை சேர்த்து, நிலத்தின் சரிவுக்கு ஏற்ப வடிகாலையை மேம்படுத்தவும். மண் அறிக்கை இல்லை, எனவே உரம் இடுவதற்கு முன் உள்ளூரில் ஊட்டச்சத்து அளவை உறுதிப்படுத்தவும்.'],
    ['Avoid heavy rain, waterlogging, and strong wind during field operations. Prefer mild weather with workable soil moisture.',
      'खेत के कामों के दौरान भारी बारिश, जलभराव और तेज हवा से बचें। काम करने योग्य मिट्टी की नमी के साथ हल्का मौसम बेहतर है।',
      'வயல் பணிகளின் போது கனமழை, நீர்தேக்கம் மற்றும் பலத்த காற்றை தவிர்க்கவும். வேலை செய்ய ஏற்ற மண் ஈரப்பதத்துடன் மிதமான வானிலை சிறந்தது.'],
    ['Heavy rain/storm forecast on',
      'इन तारीखों पर भारी बारिश/तूफान का पूर्वानुमान है:',
      'இந்த தேதிகளில் கனமழை/புயல் முன்னறிவிப்பு உள்ளது:'],
    ['Avoid spraying or fertilizing on these days, ensure field drainage, and reschedule sowing/harvesting around the wet spell if possible.',
      'इन दिनों छिड़काव या खाद न डालें, खेत की जल निकासी सुनिश्चित करें और संभव हो तो बुवाई/कटाई को बारिश के दिनों से बचाकर रखें।',
      'இந்த நாட்களில் தெளிப்பு அல்லது உரமிடுதல் செய்ய வேண்டாம்; வயல் வடிகாலையை உறுதி செய்து, முடிந்தால் விதைப்பு/அறுவடையை மழைக்காலத்தை தவிர்த்து மாற்றவும்.'],
    ['Store Black gram in clean, dry bags or containers after proper drying. Keep produce away from moisture and pests.',
      'उड़द को अच्छी तरह सुखाने के बाद साफ, सूखे बोरे या डिब्बों में रखें। उपज को नमी और कीटों से दूर रखें।',
      'உளுந்தை நன்றாக உலர்த்திய பிறகு சுத்தமான, உலர்ந்த மூட்டைகள் அல்லது பாத்திரங்களில் சேமிக்கவும். விளைபொருளை ஈரப்பதம் மற்றும் பூச்சிகளிலிருந்து பாதுகாக்கவும்.'],
  ];

  let out = text;
  for (const [en, hi, ta] of common.sort((a, b) => b[0].length - a[0].length)) {
    out = out.split(en).join(locale === 'ta' ? ta : hi);
  }

  if (locale === 'ta') {
    out = out
      .replace(/Clear weeds, plough the field, break clods, and level the land for .*?\. Add well-decomposed farmyard manure and improve drainage based on the field slope\. No soil report is available, so confirm nutrient dose locally before applying fertilizer\./g, 'களைகளை அகற்றி, வயலை உழுது, கட்டிகளை உடைத்து நிலத்தை சமப்படுத்தவும். நன்றாக மக்கிய தொழு உரத்தை சேர்த்து, நிலத்தின் சரிவுக்கு ஏற்ப வடிகாலையை மேம்படுத்தவும். மண் அறிக்கை இல்லை, எனவே உரம் இடுவதற்கு முன் உள்ளூரில் ஊட்டச்சத்து அளவை உறுதிப்படுத்தவும்.')
      .replace(/Buy healthy .*? seed from a reliable source\. Treat seed with recommended biofertilizer or fungicide before sowing, and keep enough seed for gap filling\./g, 'நம்பகமான இடத்திலிருந்து ஆரோக்கியமான உளுந்து விதையை வாங்கவும். விதைப்புக்கு முன் பரிந்துரைக்கப்பட்ட உயிர் உரம் அல்லது பூஞ்சாணநாசியால் விதை நேர்த்தி செய்து, இடைவெளி நிரப்ப போதுமான விதை வைத்திருக்கவும்.')
      .replace(/Sow .*? at the right spacing for your local variety\. Keep soil moist during germination, avoid sowing before heavy .*?, and mark rows clearly for easy weeding\./g, 'உங்கள் உள்ளூர் ரகத்திற்கு ஏற்ற இடைவெளியில் உளுந்தை விதைக்கவும். முளைப்பு காலத்தில் மண்ணை ஈரமாக வைத்துக் கொண்டு, கனமழைக்கு முன் விதைப்பை தவிர்த்து, களை எடுக்க வரிசைகளை தெளிவாக குறிக்கவும்.')
      .replace(/Maintain light, regular irrigation according to soil moisture\. Remove weeds early, especially during the first three weeks, so .*? does not compete for nutrients\./g, 'மண் ஈரப்பதத்திற்கு ஏற்ப லேசான, சீரான பாசனம் செய்யவும். குறிப்பாக முதல் மூன்று வாரங்களில் களைகளை ஆரம்பத்திலேயே அகற்றவும்; இதனால் உளுந்து ஊட்டச்சத்துக்காக போட்டியிட வேண்டியதில்லை.')
      .replace(/Apply nutrients in split doses based on the soil report and crop growth\. Inspect leaves, stems, and flowers twice a week, and use biological or recommended chemical control only when symptoms are seen\./g, 'மண் அறிக்கை மற்றும் பயிர் வளர்ச்சியைப் பொருத்து ஊட்டச்சத்துகளை பிரித்த அளவில் இடவும். இலை, தண்டு, பூக்களை வாரத்திற்கு இரண்டு முறை பரிசோதித்து, அறிகுறிகள் தெரிந்தால் மட்டுமே உயிரியல் அல்லது பரிந்துரைக்கப்பட்ட இரசாயன கட்டுப்பாட்டைப் பயன்படுத்தவும்.')
      .replace(/Harvest .*? when the crop reaches maturity and moisture is suitable\. Dry, grade, and store the produce cleanly before selling during the best local market window\./g, 'பயிர் முதிர்ச்சி அடைந்து ஈரப்பதம் ஏற்றதாக இருக்கும் போது உளுந்தை அறுவடை செய்யவும். சிறந்த உள்ளூர் சந்தை காலத்தில் விற்கும் முன் விளைபொருளை உலர்த்தி, தரம் பிரித்து, சுத்தமாக சேமிக்கவும்.')
      .replace(/\brain\b/g, 'மழை')
      .replace(/\bto\b/g, 'முதல்')
      .replace(/\bmm\b/g, 'மி.மீ')
      .replace(/°C/g, '°C')
      .replace(/\bdays\b/g, 'நாட்கள்');
  } else {
    out = out
      .replace(/Clear weeds, plough the field, break clods, and level the land for .*?\. Add well-decomposed farmyard manure and improve drainage based on the field slope\. No soil report is available, so confirm nutrient dose locally before applying fertilizer\./g, 'खरपतवार हटाएं, खेत की जुताई करें, ढेलों को तोड़ें और जमीन समतल करें। अच्छी तरह सड़ी हुई गोबर खाद डालें और खेत की ढलान के अनुसार जल निकासी सुधारें। मिट्टी रिपोर्ट उपलब्ध नहीं है, इसलिए खाद डालने से पहले स्थानीय स्तर पर पोषक मात्रा की पुष्टि करें।')
      .replace(/Buy healthy .*? seed from a reliable source\. Treat seed with recommended biofertilizer or fungicide before sowing, and keep enough seed for gap filling\./g, 'विश्वसनीय स्रोत से स्वस्थ उड़द का बीज खरीदें। बुवाई से पहले सिफारिश किए गए जैव उर्वरक या फफूंदनाशक से बीज उपचार करें, और खाली जगह भरने के लिए पर्याप्त बीज रखें।')
      .replace(/Sow .*? at the right spacing for your local variety\. Keep soil moist during germination, avoid sowing before heavy .*?, and mark rows clearly for easy weeding\./g, 'अपनी स्थानीय किस्म के लिए सही दूरी पर उड़द की बुवाई करें। अंकुरण के दौरान मिट्टी को नम रखें, भारी बारिश से पहले बुवाई न करें, और निराई के लिए कतारों को स्पष्ट चिह्नित करें।')
      .replace(/Maintain light, regular irrigation according to soil moisture\. Remove weeds early, especially during the first three weeks, so .*? does not compete for nutrients\./g, 'मिट्टी की नमी के अनुसार हल्की और नियमित सिंचाई करें। शुरुआत में, खासकर पहले तीन हफ्तों में खरपतवार हटाएं, ताकि उड़द को पोषक तत्वों के लिए प्रतिस्पर्धा न करनी पड़े।')
      .replace(/Apply nutrients in split doses based on the soil report and crop growth\. Inspect leaves, stems, and flowers twice a week, and use biological or recommended chemical control only when symptoms are seen\./g, 'मिट्टी रिपोर्ट और फसल वृद्धि के आधार पर पोषक तत्वों को विभाजित मात्रा में दें। पत्तियों, तनों और फूलों की हफ्ते में दो बार जांच करें, और लक्षण दिखने पर ही जैविक या सिफारिशी रासायनिक नियंत्रण करें।')
      .replace(/Harvest .*? when the crop reaches maturity and moisture is suitable\. Dry, grade, and store the produce cleanly before selling during the best local market window\./g, 'फसल पकने और नमी उपयुक्त होने पर उड़द की कटाई करें। सबसे अच्छे स्थानीय बाजार समय में बेचने से पहले उपज को सुखाएं, ग्रेड करें और साफ तरीके से संग्रहित करें।')
      .replace(/\brain\b/g, 'बारिश')
      .replace(/\bto\b/g, 'से')
      .replace(/\bdays\b/g, 'दिन');
  }

  return out;
}

function localTranslate(value: unknown, locale: 'hi' | 'ta'): unknown {
  if (typeof value === 'string') return replaceAllText(value, locale);
  if (Array.isArray(value)) return value.map((item) => localTranslate(item, locale));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, localTranslate(item, locale)])
    );
  }
  return value;
}

function hasSameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export async function POST(req: NextRequest) {
  let parsedBody: z.infer<typeof TranslateSchema> | null = null;
  try {
    parsedBody = TranslateSchema.parse(await req.json());
    const { locale, payload } = parsedBody;

    if (locale === 'en' && parsedBody.kind !== 'soil_report' && parsedBody.kind !== 'current_plan_details') {
      return NextResponse.json({ payload });
    }

    const fallbackPayload = locale === 'en' ? payload : localTranslate(payload, locale);

    const prompt = parsedBody.kind === 'soil_report'
      ? `Translate this soil report JSON into ${LANGUAGE_NAME[locale]}.

Rules:
- Return only valid JSON with the same keys and structure.
- Translate only farmer-facing text fields: plainLanguageSummary, keyFindings, recommendations, and similar explanation text.
- Keep JSON keys in English.
- Keep pH, EC, chemical symbols, numbers, units, N/P/K, ZnSO4, CuSO4, low/medium/high, deficient/sufficient/excess unchanged unless they are part of a full sentence.

JSON:
${JSON.stringify(payload)}`
      : parsedBody.kind === 'current_plan_details'
        ? `Translate this current crop plan detail JSON into ${LANGUAGE_NAME[locale]}.

Rules:
- Return only valid JSON with the same keys and structure.
- Translate all farmer-facing text in strings and string arrays.
- Keep JSON keys in English.
- Keep dates, numbers, currency values, units, emoji, pH, EC, N/P/K, and chemical symbols unchanged.
- Translate crop names, farm tasks, weather descriptions, water/land notes, and assessment text.

JSON:
${JSON.stringify(payload)}`
      : `Translate this crop plan JSON into ${LANGUAGE_NAME[locale]}.

Rules:
- Return only valid JSON with the same keys and structure.
- Translate all farmer-facing text values: cropName, milestone label, tasks, weatherRequirement, weatherSummary, alertAdvice, sellWindow, storageNotes, reason, season, estimatedRevenue, and any similar display text.
- Keep JSON keys in English.
- Keep dates, IDs, numbers, currency amounts, units, emoji, and ISO date strings unchanged.
- Keep agronomy meaning accurate for Tamil Nadu farmers.

JSON:
${JSON.stringify(payload)}`;

    const translated = await chatWithBedrock(
      [{ role: 'user', content: prompt }],
      `You are a precise agricultural translation engine. Translate only display text into ${LANGUAGE_NAME[locale]} and return valid JSON only.`,
      { json: true, maxTokens: 7000 }
    );

    try {
      const parsed = JSON.parse(translated);
      return NextResponse.json({ payload: hasSameJson(parsed, payload) ? fallbackPayload : parsed });
    } catch {
      const match = translated.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return NextResponse.json({ payload: hasSameJson(parsed, payload) ? fallbackPayload : parsed });
      }
      return NextResponse.json({ payload: fallbackPayload });
    }
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Translation failed:', err);
    if (parsedBody?.locale === 'en') {
      return NextResponse.json({ payload: parsedBody.payload });
    }
    if (parsedBody?.locale === 'ta' || parsedBody?.locale === 'hi') {
      return NextResponse.json({ payload: localTranslate(parsedBody.payload, parsedBody.locale) });
    }
    return NextResponse.json({ error: 'Translation failed' }, { status: 500 });
  }
}
