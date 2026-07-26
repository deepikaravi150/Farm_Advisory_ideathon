import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { queryItems, Tables } from '@/lib/aws/dynamodb';
import { generateChatReply, type Message } from '@/lib/chat-engine';

// Chat (and crop-photo vision diagnosis) can take a while; allow up to 60s on Vercel.
export const maxDuration = 60;

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const HistorySchema = z.array(z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})).default([]);

const ChatSchema = z.object({
  message: z.string().min(1),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
  mode: z.enum(['normal', 'checkin']).default('normal'),
  history: HistorySchema,
  chatId: z.string().optional(),
  chatTimestamp: z.string().optional(),
});

const ATTACH_TYPE_ERROR: Record<'en' | 'hi' | 'ta', string> = {
  en: 'Please attach a JPEG, PNG, or WEBP photo.',
  hi: 'कृपया JPEG, PNG, या WEBP फोटो संलग्न करें।',
  ta: 'JPEG, PNG அல்லது WEBP புகைப்படத்தை இணைக்கவும்.',
};

const ATTACH_SIZE_ERROR: Record<'en' | 'hi' | 'ta', string> = {
  en: 'Image too large. Please attach a photo under 10 MB.',
  hi: 'फोटो बहुत बड़ी है। कृपया 10 MB से छोटी फोटो संलग्न करें।',
  ta: 'படம் மிகப் பெரியது. 10 MB க்கும் குறைவான புகைப்படத்தை இணைக்கவும்.',
};

const CHAT_FAILED_ERROR: Record<'en' | 'hi' | 'ta', string> = {
  en: 'Chat failed',
  hi: 'चैट विफल रही',
  ta: 'அரட்டை தோல்வியடைந்தது',
};

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let localeForError: 'en' | 'hi' | 'ta' = 'en';
  try {
    // The chat accepts plain JSON (text/voice) or multipart/form-data when the
    // farmer attaches a crop photo. Only switch to formData on multipart so the
    // existing JSON callers are untouched.
    const contentType = req.headers.get('content-type') ?? '';
    const isMultipart = contentType.includes('multipart/form-data');

    let message: string;
    let locale: 'en' | 'hi' | 'ta';
    let mode: 'normal' | 'checkin' = 'normal';
    let history: Message[];
    let chatId: string | undefined;
    let chatTimestamp: string | undefined;
    let image: { buffer: Buffer; type: string; name?: string } | null = null;

    if (isMultipart) {
      const form = await req.formData();
      const imageFile = (form.get('file') as File | null) ?? null;
      const rawLocale = String(form.get('locale') ?? 'en');
      locale = (['en', 'hi', 'ta'].includes(rawLocale) ? rawLocale : 'en') as 'en' | 'hi' | 'ta';
      localeForError = locale;
      mode = String(form.get('mode') ?? 'normal') === 'checkin' ? 'checkin' : 'normal';
      const caption = String(form.get('message') ?? '').trim();
      message = caption || (locale === 'ta'
        ? '[பயிர் புகைப்படம்] என் பயிரை பாருங்கள்.'
        : locale === 'hi'
          ? '[फसल फोटो] मेरी फसल देखिए।'
          : '[crop photo] Please check my crop.');
      let parsedHistory: unknown = [];
      try { parsedHistory = JSON.parse(String(form.get('history') ?? '[]')); } catch { parsedHistory = []; }
      history = HistorySchema.parse(Array.isArray(parsedHistory) ? parsedHistory : []);
      chatId = String(form.get('chatId') ?? '') || undefined;
      chatTimestamp = String(form.get('chatTimestamp') ?? '') || undefined;

      if (imageFile && imageFile.size > 0) {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(imageFile.type)) {
          return NextResponse.json({ error: ATTACH_TYPE_ERROR[locale] }, { status: 400 });
        }
        if (imageFile.size > 10 * 1024 * 1024) {
          return NextResponse.json({ error: ATTACH_SIZE_ERROR[locale] }, { status: 400 });
        }
        image = {
          buffer: Buffer.from(await imageFile.arrayBuffer()),
          type: imageFile.type,
          name: imageFile.name || 'crop.jpg',
        };
      }
    } else {
      const parsed = ChatSchema.parse(await req.json());
      message = parsed.message;
      locale = parsed.locale;
      localeForError = locale;
      mode = parsed.mode;
      history = parsed.history;
      chatId = parsed.chatId;
      chatTimestamp = parsed.chatTimestamp;
    }

    const result = await generateChatReply(farmer, {
      message,
      locale,
      mode,
      history,
      chatId,
      chatTimestamp,
      image,
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Chat error:', err);
    return NextResponse.json({ error: CHAT_FAILED_ERROR[localeForError] }, { status: 500 });
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
