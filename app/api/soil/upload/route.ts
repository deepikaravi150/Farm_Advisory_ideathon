import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { verifyToken } from '@/lib/auth';
import { uploadToS3, buildS3Key } from '@/lib/aws/s3';
import { chatWithBedrock, extractTextFromDocument, extractTextFromPdfDocument } from '@/lib/ai/openai';
import { putItem, queryItems, updateItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

function outputLanguage(locale: string) {
  if (locale === 'ta') return 'Tamil';
  if (locale === 'hi') return 'Hindi';
  return 'English';
}

function buildExtractionPrompt(locale: string) {
  const language = outputLanguage(locale);
  return `Extract soil test data from this report image/document. Return a JSON object with exactly this structure:
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
  "plainLanguageSummary": "Explain the report in simple words for a farmer. Mention whether the soil is acidic/neutral/alkaline, which nutrients need attention, and what to do next.",
  "keyFindings": ["short farmer-friendly finding 1", "short farmer-friendly finding 2", "short farmer-friendly finding 3"],
  "recommendations": "Brief recommendations based on the soil report",
  "labName": "name of lab if visible",
  "reportDate": "YYYY-MM-DD or null"
}
Return only valid JSON. Use null for any field not found in the report.
Write only these farmer-facing text fields in ${language}: plainLanguageSummary, keyFindings, recommendations.
Keep JSON keys in English. Keep nutrient status values as low/medium/high and micronutrient status values as deficient/sufficient/excess.`;
}

async function extractTextFromPdf(buffer: Buffer) {
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(buffer);
    return parsed.text.trim();
  } catch {
    return '';
  }
}

async function extractSoilDataFromPdfText(text: string, extractionPrompt: string) {
  if (!text) {
    throw new Error('No readable text found in PDF. Please upload a clear text PDF or an image of the report.');
  }

  return chatWithBedrock(
    [{ role: 'user', content: `${extractionPrompt}\n\nSoil report text:\n${text.slice(0, 12000)}` }],
    'You read soil test reports for farmers. Extract the values carefully and explain them in simple, practical language. Return only valid JSON.',
    { json: true, maxTokens: 2048 }
  );
}

async function extractSoilDataFromPdf(buffer: Buffer, filename: string, extractionPrompt: string) {
  try {
    return await extractTextFromPdfDocument(
      buffer.toString('base64'),
      filename || 'soil-report.pdf',
      `${extractionPrompt}

This PDF may be a scanned or rotated soil report. Read the page visually if text extraction is not available. The report may contain tables for pH, EC, organic carbon, N, P, K, micronutrients, amendments, and crop-specific recommendations.`
    );
  } catch {
    const pdfText = await extractTextFromPdf(buffer);
    return extractSoilDataFromPdfText(pdfText, extractionPrompt);
  }
}

function dbItemToSoilData(item: Record<string, unknown>) {
  return {
    ph: item.ph,
    nitrogen: item.nitrogen,
    phosphorus: item.phosphorus,
    potassium: item.potassium,
    organicCarbon: item.organic_carbon,
    electricalConductivity: item.electrical_conductivity,
    micronutrients: item.micronutrients,
    plainLanguageSummary: item.plain_language_summary,
    keyFindings: item.key_findings,
    recommendations: item.recommendations,
    labName: item.lab_name,
    reportDate: item.report_date,
  };
}

async function markPreviousReportsNotCurrent(farmerId: string, reports: Record<string, unknown>[]) {
  for (const old of reports) {
    if (old.is_current) {
      await updateItem({
        TableName: Tables.SOIL_REPORTS,
        Key: { farmer_id: farmerId, uploaded_at: old.uploaded_at },
        UpdateExpression: 'SET is_current = :false',
        ExpressionAttributeValues: { ':false': false },
      });
    }
  }
}

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI is not configured. Add OPENAI_API_KEY to .env.local and restart the server.' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const locale = String(formData.get('locale') ?? 'en');
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: 'Only JPEG, PNG, WEBP, or PDF allowed' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const extractionPrompt = buildExtractionPrompt(locale);

    const existing = await queryItems({
      TableName: Tables.SOIL_REPORTS,
      KeyConditionExpression: 'farmer_id = :fid',
      ExpressionAttributeValues: { ':fid': farmer.farmerId },
    });
    const duplicate = existing.find(report => report.file_hash === fileHash);
    if (duplicate) {
      await markPreviousReportsNotCurrent(farmer.farmerId, existing);
      await updateItem({
        TableName: Tables.SOIL_REPORTS,
        Key: { farmer_id: farmer.farmerId, uploaded_at: duplicate.uploaded_at },
        UpdateExpression: 'SET is_current = :true, updated_at = :updated, locale = :locale',
        ExpressionAttributeValues: {
          ':true': true,
          ':updated': new Date().toISOString(),
          ':locale': locale,
        },
      });

      return NextResponse.json({
        success: true,
        duplicate: true,
        soilData: dbItemToSoilData(duplicate),
        reportId: duplicate.report_id,
        s3Key: duplicate.s3_key,
        jsonS3Key: duplicate.json_s3_key,
      });
    }

    const s3Key = buildS3Key(farmer.farmerId, 'soil', file.name);
    await uploadToS3(s3Key, buffer, file.type);

    const extractedText = file.type === 'application/pdf'
      ? await extractSoilDataFromPdf(buffer, file.name, extractionPrompt)
      : await extractTextFromDocument(
          buffer.toString('base64'),
          file.type as 'image/jpeg' | 'image/png' | 'image/webp',
          extractionPrompt
        );

    // Parse extracted JSON
    const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('AI did not return readable soil report data.');
    const soilData = JSON.parse(jsonMatch[0]);

    const uploadedAt = new Date().toISOString();
    const reportId = generateId();
    const jsonS3Key = `${farmer.farmerId}/soil/${reportId}-soil-report-extraction.json`;

    await uploadToS3(
      jsonS3Key,
      Buffer.from(JSON.stringify({
        reportId,
        farmerId: farmer.farmerId,
        locale,
        uploadedAt,
        sourceFileKey: s3Key,
        sourceFileName: file.name,
        sourceContentType: file.type,
        soilData,
      }, null, 2)),
      'application/json'
    );

    // Mark previous reports as not current.
    await markPreviousReportsNotCurrent(farmer.farmerId, existing);

    await putItem(Tables.SOIL_REPORTS, {
      farmer_id: farmer.farmerId,
      uploaded_at: uploadedAt,
      report_id: reportId,
      s3_key: s3Key,
      json_s3_key: jsonS3Key,
      file_hash: fileHash,
      file_name: file.name,
      content_type: file.type,
      locale,
      ph: soilData.ph,
      nitrogen: soilData.nitrogen,
      phosphorus: soilData.phosphorus,
      potassium: soilData.potassium,
      organic_carbon: soilData.organicCarbon,
      electrical_conductivity: soilData.electricalConductivity,
      micronutrients: soilData.micronutrients,
      plain_language_summary: soilData.plainLanguageSummary,
      key_findings: soilData.keyFindings,
      recommendations: soilData.recommendations,
      lab_name: soilData.labName,
      report_date: soilData.reportDate,
      is_current: true,
    });

    return NextResponse.json({ success: true, soilData, reportId, s3Key, jsonS3Key });
  } catch (err) {
    console.error('Soil upload error:', err);
    const errorDetail = err instanceof Error ? err.message : 'Unknown error';
    const message = errorDetail.includes('No readable text found')
      ? 'This PDF could not be read. Please upload a clearer soil report image or PDF.'
      : 'Soil report processing failed. Please upload a clear PDF, JPEG, PNG, or WEBP soil test report.';
    const visibleMessage = process.env.NODE_ENV === 'production'
      ? message
      : `${message} Detail: ${errorDetail}`;

    return NextResponse.json({ error: visibleMessage, detail: errorDetail }, { status: 500 });
  }
}
