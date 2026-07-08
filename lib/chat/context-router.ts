/**
 * Cheap, deterministic context router for the chat engine.
 *
 * The LLM has no tools — every message otherwise gets the FULL context stuffed
 * into its prompt (profile, soil, weather, RAG, schemes, finances, memory). That's
 * ~2–4k input tokens regardless of what was asked. This classifies the message by
 * simple en/hi/ta keywords and returns which heavy blocks to include, so we also
 * skip the RAG embedding call and the weather API call when they aren't needed.
 *
 * Bias is toward NOT degrading answers: an ordinary farming question still gets
 * RAG + soil. Only clear greetings, or pure money/scheme admin questions, trim.
 */

export interface ContextRoute {
  rag: boolean;        // retrieve + include knowledge-base chunks (also gates the embedding call)
  soil: boolean;       // include the soil-report block
  weather: boolean;    // fetch + include live weather (also gates the weather API call)
  schemes: boolean;    // include matched government schemes
  financial: boolean;  // load + include the money-ledger summary
  minimal: boolean;    // trivial greeting/ack → also skip the background summary/facts LLM call
}

const FINANCIAL =
  /\b(money|spend|spent|spending|expenses?|cost|income|earn(?:ing|ed)?|profit|loss|sold|sell(?:ing)?|sale|price|market ?(?:rate|price)|mandi|budget|loans?|borrow|repay|rupees?|rs)\b|₹|செலவ|விற்|விலை|லாப|நஷ்ட|சந்தை|கடன்|வருமான|ரூபா|பணம்|खर्च|बेच|कीमत|भाव|लाभ|नुकसान|बाज़?ार|कर्ज|आय|कमाई|रुपय|रुपये|लोन|मंडी/i;

const SCHEME =
  /\b(schemes?|subsid(?:y|ies)|government|govt|pension|insurance|pm-?kisan|kisan|beneficiary|eligib\w*|apply|application|waiver|grant)\b|திட்டம்|மானிய|அரசு|காப்பீட|ஓய்வூதிய|சலுகை|தகுதி|योजना|सब्सिडी|सरकार|बीमा|पेंशन|पात्र|अनुदान|ऋण/i;

const WEATHER =
  /\b(weather|rain(?:ing|fall)?|storm|cyclone|temperature|wind|humid\w*|climate|forecast|irrigat\w*|water(?:ing)?|spray\w*|sow\w*|plant(?:ing)?|transplant\w*|harvest\w*)\b|வானிலை|மழை|நீர்|பாசன|தெளி|விதை|நடவு|அறுவடை|வெப்ப|காற்று|मौसम|बारिश|बरसात|पानी|सिंचाई|छिड़क|बुवाई|बोना|रोपाई|कटाई|तापमान|हवा|आंधी/i;

const AGRONOMY =
  /\b(crop|paddy|rice|maize|cotton|sugarcane|groundnut|banana|tomato|brinjal|chilli|turmeric|millets?|gram|sesame|pest|disease|insect|fungus|blight|leaf|leaves|yellow|wilt|fertili[sz]\w*|urea|dap|npk|potash|manure|compost|seed|variety|dose|nutrient|yield|grow\w*|soil|weed|spacing|nursery)\b|பயிர்|நெல்|பூச்சி|நோய்|இலை|உரம்|விதை|மகசூல்|களை|மண்|फसल|धान|कीट|रोग|पत्त|खाद|उर्वरक|बीज|उपज|मिट्टी|खरपतवार/i;

const GREETING =
  /^\s*(hi+|hello+|hey+|yo|ok(?:ay|ey)?|k|thanks?|thank ?you|thankyou|thx|good ?(?:morning|afternoon|evening|night)|gm|gn|bye|welcome|great|nice|super|vanakkam|nandri|நன்றி|வணக்கம்|சரி|ஓகே|शुक्रिया|धन्यवाद|नमस्ते|नमस्कार|ठीक|ओके|अच्छा)\b/i;

/** Decide which heavy context blocks to attach for this message. */
export function routeContext(
  message: string,
  opts: { mode?: 'normal' | 'checkin'; hasImage?: boolean } = {},
): ContextRoute {
  // A crop photo is an agronomy diagnosis — needs soil + weather + KB.
  if (opts.hasImage) {
    return { rag: true, soil: true, weather: true, schemes: false, financial: false, minimal: false };
  }

  const t = (message ?? '').toLowerCase();
  const financial = FINANCIAL.test(t);
  const scheme = SCHEME.test(t);
  const weather = WEATHER.test(t);
  const agronomy = AGRONOMY.test(t);
  const words = t.trim().split(/\s+/).filter(Boolean).length;

  // Daily field check-in is always about the current crop/stage.
  if (opts.mode === 'checkin') {
    return { rag: true, soil: true, weather: true, schemes: scheme, financial, minimal: false };
  }

  // Trivial greeting/ack with no topic → minimal prompt + skip background meta.
  if (words <= 4 && GREETING.test(message.trim()) && !financial && !scheme && !weather && !agronomy) {
    return { rag: false, soil: false, weather: false, schemes: false, financial: false, minimal: true };
  }

  // Pure money/scheme admin question with no agronomy/weather angle → drop KB + soil.
  const onlyAdmin = (financial || scheme) && !agronomy && !weather;
  return {
    rag: !onlyAdmin,
    soil: !onlyAdmin,
    weather,
    schemes: scheme,
    financial,
    minimal: false,
  };
}
