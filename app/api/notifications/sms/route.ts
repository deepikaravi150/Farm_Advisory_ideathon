import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyToken } from '@/lib/auth';
import { sendSMS, sendWeatherAlert, sendMilestoneReminder } from '@/lib/aws/sns';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';

function getAuthFarmer(req: NextRequest) {
  const token = req.cookies.get('auth_token')?.value;
  return token ? verifyToken(token) : null;
}

const SMSSchema = z.object({
  type: z.enum(['weather_alert', 'milestone_reminder', 'custom']),
  message: z.string().min(1).max(160),
});

export async function POST(req: NextRequest) {
  const farmer = getAuthFarmer(req);
  if (!farmer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { type, message } = SMSSchema.parse(body);

    const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });
    if (!profile?.phone) return NextResponse.json({ error: 'No phone number on profile' }, { status: 400 });

    if (type === 'weather_alert') {
      await sendWeatherAlert(profile.phone as string, message);
    } else if (type === 'milestone_reminder') {
      await sendMilestoneReminder(profile.phone as string, message);
    } else {
      await sendSMS(profile.phone as string, message);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.errors }, { status: 400 });
    console.error('SMS error:', err);
    return NextResponse.json({ error: 'SMS sending failed' }, { status: 500 });
  }
}

// Internal weather check endpoint — can be called by a cron/scheduler
export async function GET(req: NextRequest) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // This would iterate over all farmers with active crop plans and check weather
  // For demonstration purposes, structure is shown here
  return NextResponse.json({ message: 'Weather check endpoint — implement cron logic here' });
}
