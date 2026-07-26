import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import TabBar from '@/components/layout/TabBar';

/**
 * Shared shell for every authenticated screen. Verifies the session, frames the
 * app to phone width (so it reads as a mobile app even on desktop) and pins the
 * iOS-style bottom tab bar. Individual pages own their own scrolling.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-slate-50 shadow-sm">
      {/* Pages add their own bottom padding; the chat tab manages full height. */}
      <main className="flex-1">{children}</main>
      <TabBar />
    </div>
  );
}
