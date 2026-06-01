import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getItem, Tables } from '@/lib/aws/dynamodb';
import Navbar from '@/components/layout/Navbar';
import WeatherWidget from '@/components/dashboard/WeatherWidget';
import ChatSummaryWidget from '@/components/dashboard/ChatSummaryWidget';
import ChatPanel from '@/components/chatbot/ChatPanel';
import LandMapWidget from '@/components/dashboard/LandMapWidgetClient';

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  const profile = await getItem(Tables.FARMER_PROFILES, { farmer_id: farmer.farmerId });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar farmerName={farmer.name} />
      <div className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">Good day, {farmer.name}!</h1>
        <p className="text-sm text-gray-500 mb-6">{new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — widgets */}
          <div className="lg:col-span-2 space-y-6">
            <WeatherWidget />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <LandMapWidget
                coordinates={(profile?.land_coordinates as Array<{lat:number;lng:number}>) ?? []}
                landArea={(profile?.land_area_acres as number) ?? 0}
                s3ImageKey={profile?.land_picture_s3_key as string | undefined}
              />
              <ChatSummaryWidget />
            </div>
          </div>

          {/* Right column — chat */}
          <div className="lg:col-span-1 h-[600px]">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  );
}
