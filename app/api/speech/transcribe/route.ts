import { NextRequest, NextResponse } from 'next/server';
import { transcribeAudio } from '@/lib/aws/transcribe';
import { verifyToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token || !verifyToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;
    const locale = (formData.get('locale') as string) ?? 'en';

    if (!audioFile) return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });

    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const transcript = await transcribeAudio(buffer, locale);

    return NextResponse.json({ transcript });
  } catch (err) {
    console.error('Transcribe error:', err);
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 });
  }
}
