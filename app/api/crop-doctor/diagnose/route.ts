import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { uploadToS3, buildS3Key } from '@/lib/aws/s3';
import { extractTextFromDocument } from '@/lib/ai/openai';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

function outputLanguage(locale: string) {
  if (locale === 'ta') return 'Tamil';
  if (locale === 'hi') return 'Hindi';
  return 'English';
}

function buildDiagnosisPrompt(locale: string) {
  const language = outputLanguage(locale);
  return `You are a plant doctor for Tamil Nadu farmers. Look at this photo of a crop/plant and diagnose any pest, disease, or nutrient problem.

Return ONLY a valid JSON object with exactly this structure:
{
  "isPlant": true,
  "cropName": "best guess of the crop, or null if unclear",
  "healthy": false,
  "diagnosis": "short name of the problem, e.g. Leaf blight (fungal) — or 'Healthy plant' if no problem",
  "severity": "low/medium/high",
  "confidence": "low/medium/high",
  "symptoms": ["short visible symptom 1", "short visible symptom 2"],
  "cause": "what causes this problem, in simple words",
  "treatment": ["practical step 1 (prefer low-cost/organic first)", "step 2", "chemical option with example if needed"],
  "prevention": ["how to avoid it next time 1", "tip 2"],
  "plainSummary": "1-2 sentences a farmer can act on immediately"
}

Rules:
- If the image is NOT a plant/crop, set isPlant=false and put a short note in plainSummary; leave other fields null/empty.
- Do not invent a pesticide dose you are unsure of; recommend confirming with a local agri shop.
- Keep JSON keys in English.
- Write these farmer-facing fields in ${language}: diagnosis, symptoms, cause, treatment, prevention, plainSummary, cropName.
- Keep severity/confidence values as low/medium/high in English.
- Return only valid JSON, no markdown.`;
}

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI is not configured. Add OPENAI_API_KEY to .env.local and restart the server.' },
        { status: 500 },
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const locale = String(formData.get('locale') ?? 'en');
    if (!file) return NextResponse.json({ error: 'No image provided' }, { status: 400 });

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Please upload a JPEG, PNG, or WEBP photo of the plant.' }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large. Please upload a photo under 10 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Store the photo (best effort — diagnosis should still work if S3 fails).
    const s3Key = buildS3Key(farmer.farmerId, 'crop', file.name);
    uploadToS3(s3Key, buffer, file.type).catch((e) => console.error('Crop doctor S3 upload failed:', e));

    const raw = await extractTextFromDocument(
      buffer.toString('base64'),
      file.type as 'image/jpeg' | 'image/png' | 'image/webp',
      buildDiagnosisPrompt(locale),
    );

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI did not return a readable diagnosis.');
    const diagnosis = JSON.parse(jsonMatch[0]);

    return NextResponse.json({ success: true, diagnosis, s3Key });
  } catch (err) {
    console.error('Crop doctor error:', err);
    const detail = err instanceof Error ? err.message : 'Unknown error';
    const message = 'Could not analyse the photo. Please upload a clear, close-up photo of the affected leaves or plant.';
    const visible = process.env.NODE_ENV === 'production' ? message : `${message} Detail: ${detail}`;
    return NextResponse.json({ error: visible, detail }, { status: 500 });
  }
}
