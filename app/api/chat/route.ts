import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock, summarizeText, extractFarmingContextTags, type Message } from '@/lib/ai/openai';
import { retrieveContext } from '@/lib/ai/rag';
import { queryItems, putItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { generateId, extractCentroid } from '@/lib/utils';
import { getCurrentWeather, get15DayForecast } from '@/lib/weather';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const ChatSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { message, locale, history } = ChatSchema.parse(body);

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
        Limit: 5,
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

    const systemPrompt = `You are an expert agricultural advisor specializing in Tamil Nadu farming. You help farmers with crop selection, planting schedules, pest control, fertilizer use, irrigation, harvest timing, storage, and selling guidance.

Farmer Profile:
- Name: ${profile?.name ?? farmer.name}
- Land area: ${profile?.land_area_acres ?? 'unknown'} acres
- Land type: ${profile?.typography ?? 'unknown'}
- Region: Tamil Nadu, India

${soilData ? `Soil Report (latest):
- pH: ${soilData.ph}, Nitrogen: ${soilData.nitrogen}, Phosphorus: ${soilData.phosphorus}, Potassium: ${soilData.potassium}
- Recommendations: ${soilData.recommendations}` : 'No soil report available.'}

${cropPlan ? `Current Crop Plan: ${cropPlan.crop_name}, Status: ${cropPlan.status}, Stage: ${cropPlan.current_stage ?? 'unknown'}` : 'No active crop plan.'}

${weatherContext ? `${weatherContext}\n(Use this live weather when giving advice on irrigation, spraying, sowing, harvesting or any weather-sensitive task. Reference specific days when relevant.)` : ''}

${contextSummaries ? `Recent conversation context:\n${contextSummaries}` : ''}

${kbContext ? `Reference knowledge (from the farming knowledge base — prefer this over general knowledge and cite the source when you use it):\n${kbContext}` : ''}

${languageInstruction}
Always provide practical, actionable advice relevant to Tamil Nadu climate and farming conditions. Consider the current season (today is ${new Date().toLocaleDateString('en-IN')}).`;

    const messages: Message[] = [
      ...history,
      { role: 'user', content: message },
    ];

    const reply = await chatWithBedrock(messages, systemPrompt);

    // Save chat to DynamoDB asynchronously
    const fullConversation = [...messages, { role: 'assistant' as const, content: reply }];
    const conversationText = fullConversation.map(m => `${m.role}: ${m.content}`).join('\n');

    Promise.all([
      summarizeText(conversationText),
      extractFarmingContextTags(conversationText),
    ]).then(([summary, tags]) => {
      putItem(Tables.CHAT_HISTORY, {
        farmer_id: farmer.farmerId,
        timestamp: new Date().toISOString(),
        chat_id: generateId(),
        messages: fullConversation,
        summary,
        farming_context_tags: tags,
      }).catch(console.error);
    }).catch(console.error);

    return NextResponse.json({ reply, locale });
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
