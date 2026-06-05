import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { putItem, getItem, Tables } from '@/lib/aws/dynamodb';
import { hashPassword } from '@/lib/auth';
import { generateId } from '@/lib/utils';
import { findFarmersByPhone } from '@/app/api/auth/farmers';
import { verifyPhoneVerificationOtp } from '@/lib/aws/sns';

function requireAwsEnv() {
  const missing = ['AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'].filter(key => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}. Create .env.local with the required AWS credentials.`);
  }
}

const PasswordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must include an uppercase letter')
  .regex(/[a-z]/, 'Password must include a lowercase letter')
  .regex(/\d/, 'Password must include a number')
  .regex(/[^A-Za-z0-9]/, 'Password must include a special character');

const RegisterSchema = z.object({
  farmerId: z.string().min(1, 'Farmer ID is required'),
  name: z.string().min(2, 'Name is required'),
  phone: z.string().regex(/^\d{10}$/, 'Enter a valid 10-digit phone number'),
  address: z.string().min(3, 'Address is required'),
  landCoordinates: z.array(z.object({ lat: z.number(), lng: z.number() })).min(3),
  typography: z.string().optional(),
  landAreaAcres: z.number().positive(),
  landPictureS3Key: z.string().optional(),
  password: PasswordSchema,
  otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit OTP sent to the phone number'),
});

export async function POST(req: NextRequest) {
  try {
    requireAwsEnv();
    const body = await req.json();
    const data = RegisterSchema.parse(body);

    // Check if farmer ID or phone already exists
    const existing = await getItem(Tables.FARMER_PROFILES, { farmer_id: data.farmerId });
    if (existing) {
      return NextResponse.json({ error: 'Farmer ID already registered' }, { status: 409 });
    }

    const existingPhone = await findFarmersByPhone(data.phone);
    if (existingPhone.length) {
      return NextResponse.json({ error: 'Phone number already registered' }, { status: 409 });
    }

    await verifyPhoneVerificationOtp(data.phone, data.otp);

    const passwordHash = await hashPassword(data.password);
    const uniqueId = generateId();

    await putItem(Tables.FARMER_PROFILES, {
      farmer_id: data.farmerId,
      unique_id: uniqueId,
      phone: data.phone,
      name: data.name,
      address: data.address,
      land_coordinates: data.landCoordinates,
      typography: data.typography ?? '',
      land_area_acres: data.landAreaAcres,
      land_picture_s3_key: data.landPictureS3Key ?? '',
      phone_verified: true,
      phone_verified_at: new Date().toISOString(),
      password_hash: passwordHash,
      preferred_language: 'en',
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true, farmerId: data.farmerId });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors }, { status: 400 });
    }
    console.error('Register error:', err);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
