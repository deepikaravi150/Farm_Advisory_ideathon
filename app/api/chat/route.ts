import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock, summarizeText, extractFarmingContextTags, extractFarmerFacts, extractTextFromDocument, type Message } from '@/lib/ai/openai';
import { retrieveContext } from '@/lib/ai/rag';
import { queryItems, putItem, getItem, updateItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { getCurrentWeather, get15DayForecast } from '@/lib/weather';
import { buildS3Key, uploadToS3 } from '@/lib/aws/s3';
import { formatMemoryForPrompt, type Fact } from '@/lib/memory';
import { buildDiagnosisPrompt, parseDiagnosis, formatDiagnosisForPrompt, type Diagnosis } from '@/lib/crop-doctor';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
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

const HistorySchema = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})).default([]);

const ChatSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
  history: HistorySchema,
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // The chat accepts plain JSON (text/voice) or multipart/form-data when the
    // farmer attaches a crop photo. Only switch to formData on multipart so the
    // existing JSON callers are untouched.
    const contentType = req.headers.get('content-type') ?? '';
    const isMultipart = contentType.includes('multipart/form-data');

    let message: string;
    let locale: 'en' | 'hi' | 'ta';
    let history: Message[];
    let imageFile: File | null = null;

    if (isMultipart) {
      const form = await req.formData();
      imageFile = (form.get('file') as File | null) ?? null;
      const rawLocale = String(form.get('locale') ?? 'en');
      locale = (['en', 'hi', 'ta'].includes(rawLocale) ? rawLocale : 'en') as 'en' | 'hi' | 'ta';
      const caption = String(form.get('message') ?? '').trim();
      message = caption || (locale === 'ta'
        ? '[பயிர் புகைப்படம்] என் பயிரை பாருங்கள்.'
        : locale === 'hi'
          ? '[फसल फोटो] मेरी फसल देखिए।'
          : '[crop photo] Please check my crop.');
      let parsedHistory: unknown = [];
      try { parsedHistory = JSON.parse(String(form.get('history') ?? '[]')); } catch { parsedHistory = []; }
      history = HistorySchema.parse(Array.isArray(parsedHistory) ? parsedHistory : []);
    } else {
      const parsed = ChatSchema.parse(await req.json());
      message = parsed.message;
      locale = parsed.locale;
      history = parsed.history;
    }

    // If a crop photo was attached, diagnose it via vision and fold the findings
    // into the system prompt so the LLM can answer conversationally (not as JSON).
    let diagnosis: Diagnosis | null = null;
    let diagnosisContext = '';
    let cropImageKey: string | undefined;
    if (imageFile && imageFile.size > 0) {
      const allowed = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowed.includes(imageFile.type)) {
        return NextResponse.json({ error: 'Please attach a JPEG, PNG, or WEBP photo.' }, { status: 400 });
      }
      if (imageFile.size > 10 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image too large. Please attach a photo under 10 MB.' }, { status: 400 });
      }
      try {
        const buffer = Buffer.from(await imageFile.arrayBuffer());
        cropImageKey = buildS3Key(farmer.farmerId, 'crop', imageFile.name || 'crop.jpg');
        uploadToS3(cropImageKey, buffer, imageFile.type).catch((e) => console.error('Crop photo S3 upload failed:', e));
        const raw = await extractTextFromDocument(buffer.toString('base64'), imageFile.type, buildDiagnosisPrompt(locale));
        diagnosis = parseDiagnosis(raw);
        diagnosisContext = formatDiagnosisForPrompt(diagnosis);
      } catch (e) {
        console.error('Crop photo diagnosis failed:', e);
        diagnosisContext = 'A crop photo was shared but it could not be analysed clearly. Ask the farmer to resend a clear close-up of the affected leaves.';
      }
    }

    // Gather context (DynamoDB profile/history + RAG over the S3 knowledge base)
    const [profile, soilReports, cropPlans, recentChats, kbContext] = await Promise.all([
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
    ]);

    const languageInstruction =
      locale === 'ta' ? 'Respond in Tamil language.' :
      locale === 'hi' ? 'Respond in Hindi language.' :
      'Respond in English.';

    const soilData = soilReports[0];
    const cropPlan = cropPlans[0];
    const contextSummaries = recentChats.map((c) => c.summary).filter(Boolean).join('\n');
    const memoryContext = formatMemoryForPrompt(profile?.memory as Fact[] | undefined);

    // Live weather for the farmer's land (centroid of land boundary, else Chennai).
    // Kept best-effort so chat still works if the weather API is unavailable.
    let weatherContext = '';
    try {
      const coords = profile?.land_coordinates as Array<{ lat: number; lng: number }> | undefined;
      const { lat, lng } = coords?.length
        ? extractCentroid(coords)
        : { lat: 13.0827, lng: 80.2707 };
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

${languageInstruction}
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

    Promise.all([
      summarizeText(conversationText),
      extractFarmingContextTags(conversationText),
      extractFarmerFacts(conversationText, existingFacts),
    ]).then(([summary, tags, mergedFacts]) => {
      putItem(Tables.CHAT_HISTORY, {
        farmer_id: farmer.farmerId,
        timestamp: new Date().toISOString(),
        chat_id: generateId(),
        messages: fullConversation,
        summary,
        farming_context_tags: tags,
      }).catch(console.error);

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

    return NextResponse.json({ reply, locale, diagnosis, s3Key: cropImageKey });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Chat error:', err);
    return NextResponse.json({ error: 'Chat failed' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const chats = await queryItems({
    TableName: Tables.CHAT_HISTORY,
    KeyConditionExpression: 'farmer_id = :fid',
    ExpressionAttributeValues: { ':fid': farmer.farmerId },
    ScanIndexForward: false,
    Limit: 10,
  });

  return NextResponse.json(chats);
}
