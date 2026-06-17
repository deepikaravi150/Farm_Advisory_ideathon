import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';

/**
 * FarmAdvisor opens straight into the app. Logged-in farmers land on Today's
 * Plan; everyone else goes to Login. (The old marketing landing page is gone.)
 */
export default async function Home() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  redirect(farmer ? '/today' : '/login');
}
