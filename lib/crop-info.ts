/**
 * Static agronomic reference for common Tamil Nadu crops.
 *
 * Used to show the farmer the key things a crop needs to grow (water, season,
 * temperature, ideal soil pH) without an AI call. Numeric values are kept
 * language-neutral; only the descriptive fields carry translations.
 */

export type WaterLevel = 'low' | 'medium' | 'high';
interface L { en: string; hi: string; ta: string }

export interface CropInfo {
  /** Canonical English crop name. */
  key: string;
  waterLevel: WaterLevel;
  /** Seasonal water requirement in mm, e.g. "1200–1500". */
  waterMm: string;
  /** Crop duration in days, e.g. "110–135". */
  durationDays: string;
  /** Ideal temperature band in °C, e.g. "20–37". */
  tempRange: string;
  /** Ideal soil pH band used for a quick suitability check. */
  idealPh: [number, number];
  season: L;
  soil: L;
  /** One key growing tip for the farmer. */
  tip: L;
}

type CropData = Omit<CropInfo, 'key'>;

const CROPS: Record<string, CropData> = {
  Paddy: {
    waterLevel: 'high', waterMm: '1200–1500', durationDays: '110–135', tempRange: '20–37', idealPh: [5.5, 6.5],
    season: { en: 'Kuruvai / Samba (Jun–Jan)', hi: 'खरीफ (जून–जनवरी)', ta: 'குறுவை / சம்பா (ஜூன்–ஜன)' },
    soil: { en: 'Clay / clay loam, holds water', hi: 'चिकनी / दोमट मिट्टी', ta: 'களிமண் / வண்டல் மண்' },
    tip: { en: 'Keep 2–5 cm standing water during tillering; drain before harvest.', hi: 'कल्ले फूटते समय 2–5 सेमी पानी रखें; कटाई से पहले निकाल दें।', ta: 'பிள்ளைபிடிக்கும் போது 2–5 செ.மீ நீர் வைக்கவும்; அறுவடைக்கு முன் வடியவிடவும்.' },
  },
  Groundnut: {
    waterLevel: 'medium', waterMm: '500–700', durationDays: '100–120', tempRange: '25–30', idealPh: [6.0, 6.5],
    season: { en: 'Kharif & Rabi', hi: 'खरीफ और रबी', ta: 'கார் & பின்பருவம்' },
    soil: { en: 'Sandy loam, well-drained', hi: 'बलुई दोमट, अच्छी निकासी', ta: 'மணல் கலந்த வண்டல், நல்ல வடிகால்' },
    tip: { en: 'Critical watering at flowering and pegging; avoid waterlogging.', hi: 'फूल और सुई बनते समय सिंचाई जरूरी; जलभराव से बचें।', ta: 'பூப்பு மற்றும் ஊசி கட்டும் போது பாசனம் முக்கியம்; நீர் தேங்க விடாதீர்.' },
  },
  Maize: {
    waterLevel: 'medium', waterMm: '500–800', durationDays: '90–110', tempRange: '21–30', idealPh: [5.5, 7.0],
    season: { en: 'Kharif & Rabi', hi: 'खरीफ और रबी', ta: 'கார் & பின்பருவம்' },
    soil: { en: 'Well-drained loam', hi: 'अच्छी निकासी वाली दोमट', ta: 'நல்ல வடிகால் வண்டல் மண்' },
    tip: { en: 'Avoid water stress at tasseling and grain filling.', hi: 'भुट्टा और दाना भरते समय पानी की कमी न हो।', ta: 'பூக்கும் மற்றும் தானியம் நிரம்பும் போது நீர் பற்றாக்குறை வேண்டாம்.' },
  },
  Sugarcane: {
    waterLevel: 'high', waterMm: '1500–2500', durationDays: '300–365', tempRange: '20–35', idealPh: [6.5, 7.5],
    season: { en: 'Dec–Mar planting', hi: 'दिसंबर–मार्च रोपाई', ta: 'டிச–மார்ச் நடவு' },
    soil: { en: 'Deep loam, good drainage', hi: 'गहरी दोमट, अच्छी निकासी', ta: 'ஆழமான வண்டல், நல்ல வடிகால்' },
    tip: { en: 'High water need but never waterlog; earth-up at 90–120 days.', hi: 'पानी अधिक चाहिए पर जलभराव नहीं; 90–120 दिन पर मिट्टी चढ़ाएं।', ta: 'அதிக நீர் தேவை ஆனால் தேக்கம் வேண்டாம்; 90–120 நாளில் மண் அணைக்கவும்.' },
  },
  Cotton: {
    waterLevel: 'medium', waterMm: '700–1300', durationDays: '150–180', tempRange: '21–30', idealPh: [6.0, 8.0],
    season: { en: 'Kharif (Jul–Feb)', hi: 'खरीफ (जुलाई–फरवरी)', ta: 'கார் (ஜூலை–பிப்)' },
    soil: { en: 'Black cotton / well-drained', hi: 'काली मिट्टी / अच्छी निकासी', ta: 'கரிசல் மண் / நல்ல வடிகால்' },
    tip: { en: 'Avoid waterlogging; watch for bollworm at flowering.', hi: 'जलभराव से बचें; फूल आने पर सुंडी देखें।', ta: 'நீர் தேங்க விடாதீர்; பூக்கும் போது காய்ப்புழுவை கவனிக்கவும்.' },
  },
  Tomato: {
    waterLevel: 'medium', waterMm: '400–600', durationDays: '90–120', tempRange: '20–27', idealPh: [6.0, 7.0],
    season: { en: 'Year-round (avoid peak heat)', hi: 'पूरे साल (तेज गर्मी छोड़कर)', ta: 'ஆண்டு முழுவதும் (கடும் வெயில் தவிர்)' },
    soil: { en: 'Well-drained loam, rich in organic matter', hi: 'जैविक पदार्थ युक्त दोमट', ta: 'இயற்கை சத்து நிறைந்த வண்டல் மண்' },
    tip: { en: 'Stake plants; irrigate at the base, not on leaves, to limit disease.', hi: 'पौधों को सहारा दें; पत्तों पर नहीं, जड़ में पानी दें।', ta: 'செடிகளுக்கு ஊன்று கொடுக்கவும்; இலையில் அல்ல, அடியில் நீர் பாய்ச்சவும்.' },
  },
  Brinjal: {
    waterLevel: 'medium', waterMm: '600–1000', durationDays: '100–130', tempRange: '21–30', idealPh: [5.5, 6.8],
    season: { en: 'Year-round', hi: 'पूरे साल', ta: 'ஆண்டு முழுவதும்' },
    soil: { en: 'Loam, well-drained', hi: 'दोमट, अच्छी निकासी', ta: 'வண்டல், நல்ல வடிகால்' },
    tip: { en: 'Mulch to keep moisture; pick fruit young and regularly.', hi: 'नमी हेतु मल्च करें; फल छोटा और नियमित तोड़ें।', ta: 'ஈரப்பதம் காக்க மல்ச் இடவும்; காயை இளமையில் தொடர்ந்து பறிக்கவும்.' },
  },
  Chilli: {
    waterLevel: 'medium', waterMm: '500–700', durationDays: '120–150', tempRange: '20–30', idealPh: [6.0, 7.0],
    season: { en: 'Kharif & Rabi', hi: 'खरीफ और रबी', ta: 'கார் & பின்பருவம்' },
    soil: { en: 'Well-drained loam', hi: 'अच्छी निकासी वाली दोमट', ta: 'நல்ல வடிகால் வண்டல் மண்' },
    tip: { en: 'Avoid water stress at flowering; watch for thrips and mites.', hi: 'फूल आते समय पानी की कमी न हो; थ्रिप्स/माइट देखें।', ta: 'பூக்கும் போது நீர் பற்றாக்குறை வேண்டாம்; த்ரிப்ஸ்/சிலந்தியை கவனிக்கவும்.' },
  },
  Banana: {
    waterLevel: 'high', waterMm: '1800–2200', durationDays: '300–365', tempRange: '25–30', idealPh: [6.5, 7.5],
    season: { en: 'Year-round (drip ideal)', hi: 'पूरे साल (ड्रिप उत्तम)', ta: 'ஆண்டு முழுவதும் (சொட்டுநீர் சிறந்தது)' },
    soil: { en: 'Rich, deep loam', hi: 'उपजाऊ गहरी दोमट', ta: 'வளமான ஆழமான வண்டல் மண்' },
    tip: { en: 'Needs steady moisture; drip irrigation saves water and boosts yield.', hi: 'लगातार नमी चाहिए; ड्रिप से पानी बचे और उपज बढ़े।', ta: 'நிலையான ஈரப்பதம் தேவை; சொட்டுநீர் நீரை சேமித்து விளைச்சலை அதிகரிக்கும்.' },
  },
  Turmeric: {
    waterLevel: 'high', waterMm: '1200–1500', durationDays: '240–270', tempRange: '20–30', idealPh: [5.5, 7.5],
    season: { en: 'Apr–May planting', hi: 'अप्रैल–मई रोपाई', ta: 'ஏப்–மே நடவு' },
    soil: { en: 'Well-drained loam, partial shade', hi: 'अच्छी निकासी, हल्की छाया', ta: 'நல்ல வடிகால், பகுதி நிழல்' },
    tip: { en: 'Needs good drainage; mulch heavily to retain moisture.', hi: 'अच्छी निकासी जरूरी; नमी हेतु अधिक मल्च करें।', ta: 'நல்ல வடிகால் தேவை; ஈரப்பதம் காக்க அதிக மல்ச் இடவும்.' },
  },
  'Black gram': {
    waterLevel: 'low', waterMm: '350–500', durationDays: '70–90', tempRange: '25–35', idealPh: [6.5, 7.5],
    season: { en: 'Rabi & summer', hi: 'रबी और गर्मी', ta: 'பின்பருவம் & கோடை' },
    soil: { en: 'Loam to clay loam', hi: 'दोमट से चिकनी दोमट', ta: 'வண்டல் முதல் களி வண்டல்' },
    tip: { en: 'Drought-tolerant pulse; avoid waterlogging, fixes its own nitrogen.', hi: 'सूखा सहने वाली दाल; जलभराव न हो, खुद नाइट्रोजन बनाती है।', ta: 'வறட்சி தாங்கும் பயறு; நீர் தேங்க விடாதீர், சொந்த நைட்ரஜன் சேர்க்கும்.' },
  },
  'Green gram': {
    waterLevel: 'low', waterMm: '350–500', durationDays: '60–75', tempRange: '25–35', idealPh: [6.2, 7.2],
    season: { en: 'Rabi & summer', hi: 'रबी और गर्मी', ta: 'பின்பருவம் & கோடை' },
    soil: { en: 'Loam, well-drained', hi: 'दोमट, अच्छी निकासी', ta: 'வண்டல், நல்ல வடிகால்' },
    tip: { en: 'Short-duration pulse; needs little irrigation, great for rotation.', hi: 'कम अवधि दाल; कम सिंचाई, फसल चक्र हेतु अच्छी।', ta: 'குறுகிய கால பயறு; குறைந்த பாசனம், சுழற்சிக்கு ஏற்றது.' },
  },
  Sesame: {
    waterLevel: 'low', waterMm: '300–500', durationDays: '80–95', tempRange: '25–35', idealPh: [5.5, 8.0],
    season: { en: 'Summer & Kharif', hi: 'गर्मी और खरीफ', ta: 'கோடை & கார்' },
    soil: { en: 'Sandy loam, well-drained', hi: 'बलुई दोमट, अच्छी निकासी', ta: 'மணல் வண்டல், நல்ல வடிகால்' },
    tip: { en: 'Drought-hardy; very sensitive to waterlogging, keep field dry.', hi: 'सूखा सहनशील; जलभराव से बहुत संवेदनशील, खेत सूखा रखें।', ta: 'வறட்சி தாங்கும்; நீர் தேக்கத்திற்கு மிக உணர்திறன், வயலை உலர வைக்கவும்.' },
  },
  Millets: {
    waterLevel: 'low', waterMm: '350–500', durationDays: '70–100', tempRange: '25–35', idealPh: [5.5, 8.0],
    season: { en: 'Kharif (rain-fed)', hi: 'खरीफ (वर्षा आधारित)', ta: 'கார் (மழை சார்ந்தது)' },
    soil: { en: 'Marginal / sandy soils', hi: 'हल्की / बलुई मिट्टी', ta: 'வளம் குறைந்த / மணல் மண்' },
    tip: { en: 'Very drought-tolerant; thrives on poor soils with little water.', hi: 'अत्यधिक सूखा सहनशील; कम पानी, हल्की मिट्टी में भी अच्छी।', ta: 'மிகுந்த வறட்சி தாங்கும்; குறைந்த நீர், வளம் குறைந்த மண்ணிலும் வளரும்.' },
  },
};

// Localized crop names map back to the canonical English key so a plan generated
// in Tamil/Hindi still resolves to the right reference data.
const ALIASES: Record<string, string> = {
  धान: 'Paddy', நெல்: 'Paddy', Rice: 'Paddy',
  मूंगफली: 'Groundnut', நிலக்கடலை: 'Groundnut', Peanut: 'Groundnut',
  मक्का: 'Maize', மக்காச்சோளம்: 'Maize', Corn: 'Maize',
  गन्ना: 'Sugarcane', கரும்பு: 'Sugarcane',
  कपास: 'Cotton', பருத்தி: 'Cotton',
  टमाटर: 'Tomato', தக்காளி: 'Tomato',
  बैंगन: 'Brinjal', கத்திரிக்காய்: 'Brinjal', Eggplant: 'Brinjal',
  मिर्च: 'Chilli', மிளகாய்: 'Chilli', Chili: 'Chilli', Chillies: 'Chilli',
  केला: 'Banana', வாழை: 'Banana',
  हल्दी: 'Turmeric', மஞ்சள்: 'Turmeric',
  उड़द: 'Black gram', உளுந்து: 'Black gram',
  मूंग: 'Green gram', பச்சைப்பயறு: 'Green gram',
  तिल: 'Sesame', எள்: 'Sesame',
  'मोटे अनाज': 'Millets', சிறுதானியங்கள்: 'Millets', Millet: 'Millets',
};

/** Resolve a (possibly localized or partial) crop name to its reference data. */
export function getCropInfo(name: string | undefined | null): CropInfo | null {
  if (!name) return null;
  const n = name.trim();
  if (!n) return null;

  const direct = Object.keys(CROPS).find((k) => k.toLowerCase() === n.toLowerCase());
  if (direct) return { key: direct, ...CROPS[direct] };

  if (ALIASES[n]) return { key: ALIASES[n], ...CROPS[ALIASES[n]] };

  // Fall back to a contains-match so "Paddy (ADT 43)" style names still resolve.
  const partial = Object.keys(CROPS).find((k) => n.toLowerCase().includes(k.toLowerCase()));
  if (partial) return { key: partial, ...CROPS[partial] };
  const aliasPartial = Object.keys(ALIASES).find((a) => n.includes(a));
  if (aliasPartial) return { key: ALIASES[aliasPartial], ...CROPS[ALIASES[aliasPartial]] };

  return null;
}

export function getAllCropInfos(): CropInfo[] {
  return Object.keys(CROPS).map((key) => ({ key, ...CROPS[key] }));
}
