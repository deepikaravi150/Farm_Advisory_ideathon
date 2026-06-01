import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getItem, updateItem, Tables } from '@/lib/aws/dynamodb';
import { verifyToken } from '@/lib/auth';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

  // Strip password hash before returning
  const { password_hash: _, ...safe } = profile;
  return NextResponse.json(safe);
}

const UpdateSchema = z.object({
  name: z.string().optional(),
  typography: z.string().optional(),
  landAreaAcres: z.number().optional(),
  preferredLanguage: z.enum(['en', 'hi', 'ta']).optional(),
  location: z.string().optional(),
  landPictureS3Key: z.string().optional(),
});

export async function PATCH(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const data = UpdateSchema.parse(body);

    const updates: string[] = [];
    const values: Record<string, unknown> = {};
    const names: Record<string, string> = {};

    if (data.name) { updates.push('#n = :n'); names['#n'] = 'name'; values[':n'] = data.name; }
    if (data.typography) { updates.push('typography = :t'); values[':t'] = data.typography; }
    if (data.landAreaAcres) { updates.push('land_area_acres = :la'); values[':la'] = data.landAreaAcres; }
    if (data.preferredLanguage) { updates.push('preferred_language = :pl'); values[':pl'] = data.preferredLanguage; }
    if (data.location) { updates.push('location = :loc'); values[':loc'] = data.location; }
    if (data.landPictureS3Key) { updates.push('land_picture_s3_key = :lp'); values[':lp'] = data.landPictureS3Key; }

    if (!updates.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });

    await updateItem({
      TableName: Tables.FARMER_PROFILES,
      Key: { farmer_id: farmer.farmerId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeValues: values,
      ...(Object.keys(names).length ? { ExpressionAttributeNames: names } : {}),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Profile update error:', err);
    return NextResponse.json({ error: 'Update failed' }, { status: 500 });
  }
}
