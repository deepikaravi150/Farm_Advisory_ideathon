import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { getUploadPresignedUrl, buildS3Key } from '@/lib/aws/s3';

const PresignedSchema = z.object({
  type: z.enum(['land', 'soil']),
  filename: z.string().min(1),
  contentType: z.string().min(1),
});

export async function POST(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { type, filename, contentType } = PresignedSchema.parse(body);

    const key = buildS3Key(farmer.farmerId, type, filename);
    const url = await getUploadPresignedUrl(key, contentType);

    return NextResponse.json({ url, key });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    return NextResponse.json({ error: 'Failed to generate upload URL' }, { status: 500 });
  }
}
