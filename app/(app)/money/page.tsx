import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getActiveCropPlan } from '@/lib/daily-sms';
import MoneyView from '@/components/money/MoneyView';

export default async function MoneyPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  const plan = await getActiveCropPlan(farmer.farmerId);
  const cropName = typeof plan?.crop_name === 'string' ? plan.crop_name : '';
  // data.gov.in commodity filter only understands English/ASCII names.
  const marketCommodity = /^[\x20-\x7E]+$/.test(cropName) ? cropName : '';

  return <MoneyView hasPlan={Boolean(plan)} cropName={cropName} marketCommodity={marketCommodity} />;
}
