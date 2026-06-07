import { uploadToS3, deleteFromS3 } from '@/lib/aws/s3';

function jsonBuffer(data: unknown) {
  return Buffer.from(JSON.stringify(data, null, 2));
}

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export const farmerS3Keys = {
  profile: (farmerId: string) => `${safeSegment(farmerId)}/profile/profile.json`,
  cropPlan: (farmerId: string, planId: string) => `${safeSegment(farmerId)}/crop-plans/${safeSegment(planId)}/plan.json`,
  soilOriginal: (farmerId: string, reportId: string, extension = 'pdf') =>
    `${safeSegment(farmerId)}/soil-reports/${safeSegment(reportId)}/original.${safeSegment(extension)}`,
  soilExtraction: (farmerId: string, reportId: string) =>
    `${safeSegment(farmerId)}/soil-reports/${safeSegment(reportId)}/extraction.json`,
};

export async function mirrorJsonToS3(key: string, data: unknown) {
  await uploadToS3(key, jsonBuffer(data), 'application/json');
  return key;
}

export async function mirrorProfileToS3(profile: Record<string, unknown>) {
  const farmerId = String(profile.farmer_id ?? '');
  if (!farmerId) return;
  const { password_hash: _, ...safeProfile } = profile;
  await mirrorJsonToS3(farmerS3Keys.profile(farmerId), {
    type: 'farmer_profile',
    mirroredAt: new Date().toISOString(),
    profile: safeProfile,
  });
}

export async function mirrorCropPlanToS3(plan: Record<string, unknown>) {
  const farmerId = String(plan.farmer_id ?? '');
  const planId = String(plan.plan_id ?? '');
  if (!farmerId || !planId) return;
  await mirrorJsonToS3(farmerS3Keys.cropPlan(farmerId, planId), {
    type: 'crop_plan',
    mirroredAt: new Date().toISOString(),
    plan,
  });
}

export async function deleteCropPlanFromS3(farmerId: string, planId: string) {
  await deleteFromS3(farmerS3Keys.cropPlan(farmerId, planId));
}

export async function tryMirror(label: string, work: () => Promise<void>) {
  try {
    await work();
  } catch (error) {
    console.error(`S3 mirror failed (${label}):`, error);
  }
}
