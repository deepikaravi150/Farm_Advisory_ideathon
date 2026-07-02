import {
  chatWithBedrock,
  summarizeText,
  extractFarmingContextTags,
  extractFarmerFacts,
  extractTextFromDocument,
  type Message,
} from '@/lib/ai/openai';
import { retrieveContext } from '@/lib/ai/rag';
import { queryItems, putItem, getItem, updateItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { getCurrentWeather, get15DayForecast } from '@/lib/weather';
import { buildS3Key, uploadToS3 } from '@/lib/aws/s3';
import { formatMemoryForPrompt, type Fact } from '@/lib/memory';
import {
  buildDiagnosisPrompt,
  parseDiagnosis,
  formatDiagnosisForPrompt,
  type Diagnosis,
} from '@/lib/crop-doctor';
import { maybeBroadcastFromDiagnosis } from '@/lib/pest-alert';
import { buildSchemesPromptContext } from '@/lib/schemes/chat-context';
import { listEntries } from '@/lib/money/ledger';
import { buildFinancialPromptContext } from '@/lib/money/analysis';

export type { Message };

/** The minimal farmer identity the engine needs — same shape as the JWT payload. */
export interface ChatFarmer {
  farmerId: string;
  phone: string;
  name: string;
}

/** An already-validated image (e.g. a crop photo). The caller is responsible for
 *  size/type validation; the engine just runs vision diagnosis on the bytes. */
export interface ChatImage {
  buffer: Buffer;
  type: string;
  name?: string;
}

export interface ChatEngineParams {
  message: string;
  locale?: 'en' | 'hi' | 'ta';
  mode?: 'normal' | 'checkin';
  history?: Message[];
  /** When set with chatTimestamp, the turn is appended to that existing chat item. */
  chatId?: string;
  chatTimestamp?: string;
  image?: ChatImage | null;
  /** Greet/address the farmer by their name from the profile (used on WhatsApp). */
  addressByName?: boolean;
}

export interface ChatEngineResult {
  reply: string;
  locale: 'en' | 'hi' | 'ta';
  diagnosis: Diagnosis | null;
  s3Key?: string;
  chatId: string;
  timestamp: string;
}

function formatSoilReportContext(soilData: Record<string, unknown> | undefined) {
  if (!soilData) return 'No soil report available.';

  const micronutrients = soilData.micronutrients && typeof soilData.micronutrients === 'object'
    ? Object.entries(soilData.micronutrients as Record<string, unknown>)
        .map(([name, value]) => `${name}: ${value ?? 'unknown'}`)
        .join(', ')
    : '';
  const keyFindings = Array.isArray(soilData.key_findings)
    ? soilData.key_findings.filter(Boolean).join('; ')
    : '';

  return [
    'Soil Report (latest):',
    `- pH: ${soilData.ph ?? 'unknown'}`,
    `- EC/salinity: ${soilData.electrical_conductivity ?? 'unknown'}`,
    `- Organic carbon: ${soilData.organic_carbon ?? 'unknown'}`,
    `- Nitrogen: ${soilData.nitrogen ?? 'unknown'}, Phosphorus: ${soilData.phosphorus ?? 'unknown'}, Potassium: ${soilData.potassium ?? 'unknown'}`,
    micronutrients ? `- Micronutrients: ${micronutrients}` : '',
    soilData.plain_language_summary ? `- Farmer-friendly summary: ${soilData.plain_language_summary}` : '',
    keyFindings ? `- Key findings: ${keyFindings}` : '',
    soilData.recommendations ? `- Recommendations: ${soilData.recommendations}` : '',
  ].filter(Boolean).join('\n');
}

/**
 * Core chat brain shared by the web chat (`/api/chat`) and the WhatsApp webhook
 * (`/api/whatsapp`). Given a farmer and an inbound message (optionally with a
 * crop photo), it gathers the farmer's context, asks the LLM, persists the turn,
 * and returns the reply. Transport/auth concerns stay in the route handlers.
 */
export async function generateChatReply(
  farmer: ChatFarmer,
  params: ChatEngineParams,
): Promise<ChatEngineResult> {
  const locale = params.locale ?? 'en';
  const mode = params.mode ?? 'normal';
  const history = params.history ?? [];
  const { message, chatId, chatTimestamp, image } = params;

  // If a crop photo was attached, diagnose it via vision and fold the findings
  // into the system prompt so the LLM can answer conversationally (not as JSON).
  let diagnosis: Diagnosis | null = null;
  let diagnosisContext = '';
  let cropImageKey: string | undefined;
  if (image && image.buffer.length > 0) {
    try {
      cropImageKey = buildS3Key(farmer.farmerId, 'crop', image.name || 'crop.jpg');
      uploadToS3(cropImageKey, image.buffer, image.type).catch((e) => console.error('Crop photo S3 upload failed:', e));
      const raw = await extractTextFromDocument(image.buffer.toString('base64'), image.type, buildDiagnosisPrompt(locale));
      diagnosis = parseDiagnosis(raw);
      diagnosisContext = formatDiagnosisForPrompt(diagnosis);
    } catch (e) {
      console.error('Crop photo diagnosis failed:', e);
      diagnosisContext = 'A crop photo was shared but it could not be analysed clearly. Ask the farmer to resend a clear close-up of the affected leaves.';
    }
  }

  // Gather context (DynamoDB profile/history + RAG over the S3 knowledge base)
  const [profile, soilReports, cropPlans, recentChats, kbContext, ledgerEntries] = await Promise.all([
    getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
    queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 1,
    }),
    queryItems({
      TableName: Tables.CROP_PLANS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      Limit: 1,
    }),
    queryItems({
      TableName: Tables.CHAT_HISTORY,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
      ScanIndexForward: false,
      // Durable facts now live in persistent memory; keep only a small recency
      // window of summaries for in-flight topic continuity.
      Limit: 2,
    }),
    retrieveContext(message),
    listEntries(farmer.farmerId).catch(() => []),
  ]);

  // Pest outbreak early-warning: if this photo was confirmed as a pest, alert
  // nearby farmers over WhatsApp (fire-and-forget; never blocks the reply).
  if (diagnosis) {
    maybeBroadcastFromDiagnosis({
      reporterId: farmer.farmerId,
      reporterProfile: profile,
      diagnosis,
      locale,
      s3Key: cropImageKey,
    }).catch((e) => console.error('Pest alert trigger failed:', e));
  }

  const languageInstruction =
    locale === 'ta' ? 'Respond in Tamil language.' :
    locale === 'hi' ? 'Respond in Hindi language.' :
    'Respond in English.';

  const soilData = soilReports[0];
  const cropPlan = cropPlans[0];
  // Government schemes the farmer likely qualifies for (deterministic match on
  // their profile + crop) — lets the advisor answer subsidy/scheme questions
  // from real data. Shared by web chat and WhatsApp via this engine.
  const schemesContext = buildSchemesPromptContext(profile, cropPlans);
  // Real recorded finances (expenses/sales/loans) so the advisor answers money
  // questions from actual figures, not estimates. Shared by web + WhatsApp.
  const financialContext = buildFinancialPromptContext(ledgerEntries as Parameters<typeof buildFinancialPromptContext>[0]);
  const contextSummaries = recentChats.map((c) => c.summary).filter(Boolean).join('\n');
  const memoryContext = formatMemoryForPrompt(profile?.memory as Fact[] | undefined);

  // The farmer's registered name, for addressing them personally on WhatsApp.
  const farmerName = ((profile?.name as string | undefined) ?? farmer.name ?? '').trim();
  const firstName = farmerName.split(/\s+/)[0] || farmerName;
  const addressByNameInstruction = params.addressByName && firstName
    ? `Address the farmer personally by their name, ${firstName}. Open your reply with a short, warm greeting using their name (and only their name from this profile). Use it naturally — don't repeat it in every line.\n`
    : '';

  // Live weather for the farmer's saved land centroid.
  // Kept best-effort so chat still works if the weather API is unavailable.
  let weatherContext = '';
  try {
    const coords = profile?.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
    if (coords?.length) {
      const { lat, lng } = extractCentroid(coords);
      const [current, forecast] = await Promise.all([
        getCurrentWeather(lat, lng),
        get15DayForecast(lat, lng),
      ]);
      const next5 = forecast.slice(0, 5).map(
        (d) => `${d.date}: ${d.description}, ${d.temp_min}–${d.temp_max}°C, rain ${d.rain_mm}mm`
      ).join('\n');
      weatherContext = `Live weather for ${current.city} (the farmer's land):
- Now: ${current.temp}°C (feels ${current.feels_like}°C), ${current.description}, humidity ${current.humidity}%, wind ${current.wind_speed} km/h
- Next 5 days:
${next5}`;
    }
  } catch (e) {
    console.error('Weather context fetch failed:', e);
  }

  const systemPrompt = `You are FarmAdvisor, a practical Tamil Nadu agricultural advisor for farmers.

Goal:
- Give fast, clear, field-ready advice for crop choice, planting, pest/disease control, fertilizer, irrigation, harvest, storage, and selling.
- Personalize advice using the farmer profile, soil report, crop plan, weather, recent chats, and knowledge base below.
- If a critical detail is missing, ask exactly one short follow-up question; otherwise give the best safe recommendation.

Farmer Profile:
- Name: ${profile?.name ?? farmer.name}
- Land area: ${profile?.land_area_acres ?? 'unknown'} acres
- Land type: ${profile?.typography ?? 'unknown'}
- Region: Tamil Nadu, India

${memoryContext ? `${memoryContext}\n(Treat these as known facts about THIS farmer; use them and do not re-ask what is already known.)\n` : ''}
${formatSoilReportContext(soilData)}

${cropPlan ? `Current Crop Plan: ${cropPlan.crop_name}, Status: ${cropPlan.status}, Stage: ${cropPlan.current_stage ?? 'unknown'}` : 'No active crop plan.'}

${weatherContext ? `${weatherContext}\n(Use this live weather when giving advice on irrigation, spraying, sowing, harvesting or any weather-sensitive task. Reference specific days when relevant.)` : ''}

${diagnosisContext ? `${diagnosisContext}\n(The farmer just shared a crop photo. Give a short, clear conversational diagnosis and the most important next steps. Do NOT output JSON. Weave in soil, weather, and the farmer's known facts where useful.)` : ''}

${contextSummaries ? `Recent conversation context:\n${contextSummaries}` : ''}

${kbContext ? `Reference knowledge (from the farming knowledge base — prefer this over general knowledge and cite the source when you use it):\n${kbContext}` : ''}

${schemesContext ? `Government schemes this farmer likely qualifies for:\n${schemesContext}\n(When the farmer asks about subsidies, schemes, loans, insurance, financial help, pensions, or money for seeds/inputs/equipment, recommend ONLY from this list. For each, give the benefit, who to apply to / how to apply, the key documents, and the source link. Mention any "To confirm" conditions. Always remind them to verify on the official page before applying. Do NOT invent schemes, amounts, or eligibility.)` : ''}

${financialContext ? `Farmer's recorded finances (from their money ledger):\n${financialContext}\n(Use these REAL figures when the farmer asks about spending, income, profit or loss, whether they sold above/below the market rate, or their loans. Quote the actual numbers; do not invent figures, and if something isn't recorded, say it isn't logged yet.)` : ''}

${mode === 'checkin' ? `CHECK-IN MODE: This is the farmer's daily field check-in. Treat the conversation as a quick status update on their current crop and stage. Acknowledge what they report, ask one short, relevant follow-up about crop condition, pests/disease, water, or growth at the CURRENT stage, and give the single most useful next action. Keep it warm and brief.\n` : ''}
${addressByNameInstruction}${languageInstruction}
Response rules:
- Be concise: 3-6 short bullets or short paragraphs unless the farmer asks for a detailed plan.
- Start with the direct answer or action. Do not add generic introductions.
- Include exact dates, weather cautions, quantities, or timing when available from context.
- Use live weather for irrigation, spraying, sowing, harvesting, and other weather-sensitive advice. Reference specific forecast days when useful.
- Prefer the knowledge base when relevant; mention the source briefly only when you use it.
- Do not invent soil values, market prices, pesticide doses, government rules, or unavailable weather data.
- Today is ${new Date().toLocaleDateString('en-IN')}. Keep all advice relevant to Tamil Nadu climate and farming conditions.`;

  const messages: Message[] = [
    ...history,
    { role: 'user', content: message },
  ];

  const reply = await chatWithBedrock(messages, systemPrompt, { maxTokens: 1200 });

  // Save chat to DynamoDB asynchronously. The stored user turn keeps a short
  // text marker for image messages (no base64), so the item stays small.
  const fullConversation = [...messages, { role: 'assistant' as const, content: reply }];
  const conversationText = fullConversation.map(m => `${m.role}: ${m.content}`).join('\n');
  const existingFacts = (profile?.memory as Fact[] | undefined) ?? [];
  const savedChatId = chatId ?? generateId();
  const savedTimestamp = chatTimestamp ?? new Date().toISOString();

  Promise.all([
    summarizeText(conversationText),
    extractFarmingContextTags(conversationText),
    extractFarmerFacts(conversationText, existingFacts),
  ]).then(([summary, tags, mergedFacts]) => {
    if (chatId && chatTimestamp) {
      updateItem({
        TableName: Tables.CHAT_HISTORY,
        Key: { farmer_id: farmer.farmerId, timestamp: chatTimestamp },
        UpdateExpression: 'SET messages = :messages, summary = :summary, farming_context_tags = :tags, chat_id = :chatId',
        ExpressionAttributeValues: {
          ':messages': fullConversation,
          ':summary': summary,
          ':tags': tags,
          ':chatId': chatId,
        },
      }).catch(console.error);
    } else {
      putItem(Tables.CHAT_HISTORY, {
        farmer_id: farmer.farmerId,
        timestamp: savedTimestamp,
        chat_id: savedChatId,
        messages: fullConversation,
        summary,
        farming_context_tags: tags,
      }).catch(console.error);
    }

    // Persist the updated long-term farmer memory only when it changed.
    if (JSON.stringify(mergedFacts) !== JSON.stringify(existingFacts)) {
      updateItem({
        TableName: Tables.FARMER_PROFILES,
        Key: { farmer_id: farmer.farmerId },
        UpdateExpression: 'SET memory = :m',
        ExpressionAttributeValues: { ':m': mergedFacts },
      }).catch(console.error);
    }
  }).catch(console.error);

  return { reply, locale, diagnosis, s3Key: cropImageKey, chatId: savedChatId, timestamp: savedTimestamp };
}
