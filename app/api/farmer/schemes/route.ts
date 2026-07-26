import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';
import { matchSchemes } from '@/lib/schemes/match';
import { buildFarmerFacts } from '@/lib/schemes/facts';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

/**
 * GET /api/farmer/schemes
 * Returns the government schemes ranked for the logged-in farmer (eligible /
 * likely / check), each with the reasons it matched and conditions to confirm.
 */
export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const [profile, cropPlans] = await Promise.all([
      getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId }),
      queryItems({
        TableName: Tables.CROP_PLANS,
        KeyConditionExpression: 'farmer_id = :fid',
        ExpressionAttributeValues: { ':fid': farmer.farmerId },
        ScanIndexForward: false,
      }),
    ]);

    if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 });

    const facts = buildFarmerFacts(profile, cropPlans);
    const matches = matchSchemes(facts);

    // Tell the UI which optional fields are still blank so it can nudge the
    // farmer to fill them in for sharper matching.
    const missingFields = (['community', 'gender', 'age', 'annualIncome'] as const).filter((f) => {
      if (f === 'annualIncome') return facts.annualIncome == null;
      return facts[f] == null || facts[f] === '';
    });

    return NextResponse.json({
      facts: {
        district: facts.district ?? null,
        landAreaAcres: facts.landAreaAcres ?? null,
        crops: facts.crops ?? [],
      },
      missingFields,
      counts: {
        eligible: matches.filter((m) => m.status === 'eligible').length,
        likely: matches.filter((m) => m.status === 'likely').length,
        check: matches.filter((m) => m.status === 'check').length,
        total: matches.length,
      },
      schemes: matches,
    });
  } catch (err) {
    console.error('Matched schemes error:', err);
    return NextResponse.json({ error: 'Failed to load schemes' }, { status: 500 });
  }
}
