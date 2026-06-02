import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { chatWithBedrock, summarizeText, extractFarmingContextTags, type Message } from '@/lib/ai/openai';
import { retrieveContext } from '@/lib/ai/rag';
import { queryItems, putItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';

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

function fallbackReply(message: string, locale: 'en' | 'hi' | 'ta') {
  if (locale === 'ta') {
    return `AI service is not connected right now, but I can still help with basic guidance.\n\nFor your question: "${message}"\n\nPlease check your soil moisture, recent rainfall, crop stage, and any pest symptoms. For Tamil Nadu conditions, choose crops based on available water: paddy for good water availability, millets or pulses for lower water, and vegetables only if irrigation is reliable.`;
  }

  if (locale === 'hi') {
    return `AI service is not connected right now, but I can still help with basic guidance.\n\nFor your question: "${message}"\n\nPlease check soil moisture, recent rainfall, crop stage, and pest symptoms. If water is sufficient, paddy can work well. If water is limited, prefer millets or pulses. Use vegetables only when irrigation is reliable.`;
  }

  return `AI service is not connected right now, but I can still help with basic guidance.\n\nFor your question: "${message}"\n\nCheck soil moisture, recent rainfall, crop stage, and any pest symptoms first. For Tamil Nadu conditions, choose paddy when water is reliable, millets or pulses when water is limited, and vegetables only when you have steady irrigation.`;
}

function fallbackSummary(message: string) {
  return message.length > 120 ? `${message.slice(0, 117)}...` : message;
}

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

${contextSummaries ? `Recent conversation context:\n${contextSummaries}` : ''}

${kbContext ? `Reference knowledge (from the farming knowledge base — prefer this over general knowledge and cite the source when you use it):\n${kbContext}` : ''}

${languageInstruction}
Always provide practical, actionable advice relevant to Tamil Nadu climate and farming conditions. Consider the current season (today is ${new Date().toLocaleDateString('en-IN')}).`;

    const messages: Message[] = [
      ...history,
      { role: 'user', content: message },
    ];

    let reply: string;
    try {
      reply = await chatWithBedrock(messages, systemPrompt);
    } catch (err) {
      console.error('AI reply error:', err);
      reply = fallbackReply(message, locale);
    }

    // Save chat to DynamoDB asynchronously
    const fullConversation = [...messages, { role: 'assistant' as const, content: reply }];
    const conversationText = fullConversation.map(m => `${m.role}: ${m.content}`).join('\n');
    const chatId = generateId();

    Promise.all([
      summarizeText(conversationText),
      extractFarmingContextTags(conversationText),
    ]).catch((err) => {
      console.error('Chat metadata error:', err);
      return [fallbackSummary(message), ['general_advice']] as [string, string[]];
    }).then(([summary, tags]) => {
      putItem(Tables.CHAT_HISTORY, {
        farmer_id: farmer.farmerId,
        timestamp: new Date().toISOString(),
        chat_id: chatId,
        messages: fullConversation,
        summary,
        farming_context_tags: tags,
      }).catch(console.error);
    }).catch(console.error);

    return NextResponse.json({ reply, locale, chatId });
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
