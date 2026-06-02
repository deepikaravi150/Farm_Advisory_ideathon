import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { uploadToS3, buildS3Key } from '@/lib/aws/s3';
import { extractTextFromDocument } from '@/lib/ai/openai';
import { putItem, queryItems, updateItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const EXTRACTION_PROMPT = `Extract soil test data from this report image/document. Return a JSON object with exactly this structure:
{
  "ph": 0.0,
  "nitrogen": "low/medium/high",
  "phosphorus": "low/medium/high",
  "potassium": "low/medium/high",
  "organicCarbon": "low/medium/high",
  "electricalConductivity": 0.0,
  "micronutrients": {
    "zinc": "deficient/sufficient/excess",
    "iron": "deficient/sufficient/excess",
    "manganese": "deficient/sufficient/excess",
    "copper": "deficient/sufficient/excess"
  },
  "recommendations": "Brief recommendations based on the soil report",
  "labName": "name of lab if visible",
  "reportDate": "YYYY-MM-DD or null"
}
Return only valid JSON. Use null for any field not found in the report.`;

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WEBP, or PDF allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const s3Key = buildS3Key(farmer.farmerId, 'soil', file.name);

    await uploadToS3(s3Key, buffer, file.type);

    // For PDFs, we convert to base64 and use image media type for Claude vision
    const mediaType = file.type === 'application/pdf' ? 'image/jpeg' : file.type as 'image/jpeg' | 'image/png' | 'image/webp';
    const base64 = buffer.toString('base64');

    const extractedText = await extractTextFromDocument(base64, mediaType, EXTRACTION_PROMPT);

    // Parse extracted JSON
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    const soilData = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

    const uploadedAt = new Date().toISOString();
    const reportId = generateId();

    // Mark previous reports as not current
    const existing = await queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
    });

    for (const old of existing) {
      if (old.is_current) {
        await updateItem({
          TableName: Tables.SOIL_REPORTS,
          Key: { farmer_id: farmer.farmerId, uploaded_at: old.uploaded_at },
          UpdateExpression: 'SET is_current = :false',
          ExpressionAttributeValues: { ':false': false },
        });
      }
    }

    await putItem(Tables.SOIL_REPORTS, {
      farmer_id: farmer.farmerId,
      uploaded_at: uploadedAt,
      report_id: reportId,
      s3_key: s3Key,
      ph: soilData.ph,
      nitrogen: soilData.nitrogen,
      phosphorus: soilData.phosphorus,
      potassium: soilData.potassium,
      organic_carbon: soilData.organicCarbon,
      electrical_conductivity: soilData.electricalConductivity,
      micronutrients: soilData.micronutrients,
      recommendations: soilData.recommendations,
      lab_name: soilData.labName,
      report_date: soilData.reportDate,
      is_current: true,
    });

    return NextResponse.json({ success: true, soilData, reportId });
  } catch (err) {
    console.error('Soil upload error:', err);
    return NextResponse.json({ error: 'Soil report processing failed' }, { status: 500 });
  }
}
