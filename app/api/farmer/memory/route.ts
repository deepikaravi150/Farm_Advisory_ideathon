import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { getItem, updateItem, Tables } from '@/lib/aws/dynamodb';
import { generateId } from '@/lib/utils';
import { capFacts, MEMORY_CATEGORIES, type Fact } from '@/lib/memory';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

async function readFacts(farmerId: string): Promise<Fact[]> {
  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmerId });
  return (profile?.memory as Fact[] | undefined) ?? [];
}

async function writeFacts(farmerId: string, facts: Fact[]) {
  await updateItem({
    TableName: Tables.FARMER_PROFILES,
    Key: { farmer_id: farmerId },
    UpdateExpression: 'SET memory = :m',
    ExpressionAttributeValues: { ':m': facts },
  });
}

export async function GET(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ facts: await readFacts(farmer.farmerId) });
}

const AddSchema = z.object({
  text: z.string().min(1).max(280),
  category: z.enum(MEMORY_CATEGORIES as [string, ...string[]]).optional(),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { text, category } = AddSchema.parse(await req.json());
    const fact: Fact = {
      id: generateId(),
      text: text.trim(),
      category: (category as Fact['category']) ?? 'other',
      updatedAt: new Date().toISOString(),
    };
    const facts = capFacts([fact, ...(await readFacts(farmer.farmerId))]);
    await writeFacts(farmer.farmerId, facts);
    return NextResponse.json({ facts });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('Memory add error:', err);
    return NextResponse.json({ error: 'Could not add note' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Fact id is required' }, { status: 400 });

  try {
    const facts = (await readFacts(farmer.farmerId)).filter((f) => f.id !== id);
    await writeFacts(farmer.farmerId, facts);
    return NextResponse.json({ facts });
  } catch (err) {
    console.error('Memory delete error:', err);
    return NextResponse.json({ error: 'Could not delete note' }, { status: 500 });
  }
}
