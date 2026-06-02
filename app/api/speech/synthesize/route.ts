import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { synthesizeSpeech } from '@/lib/ai/openai';
import { verifyToken } from '@/lib/auth';

const SynthesizeSchema = z.object({
  text: z.string().min(1).max(3000),
  locale: z.enum(['en', 'hi', 'ta']).default('en'),
});

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { text, locale } = SynthesizeSchema.parse(body);
    const audioBuffer = await synthesizeSpeech(text, locale);

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length.toString(),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Synthesize error:', err);
    return NextResponse.json({ error: 'Speech synthesis failed' }, { status: 500 });
  }
}
