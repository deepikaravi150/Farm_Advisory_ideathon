import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifyToken } from '@/lib/auth';
import { getItem, queryItems, Tables } from '@/lib/aws/dynamodb';
import Navbar from '@/components/layout/Navbar';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { ArrowLeft, MessageSquare } from 'lucide-react';

export default async function ChatDetailPage(props: any) {
  const { params } = props;
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const farmer = token ? verifyToken(token) : null;
  if (!farmer) redirect('/login');

  // Fetch the specific chat
  const chats = await queryItems({
    TableName: Tables.CHAT_HISTORY,
    KeyConditionExpression: 'farmer_id = :fid AND chat_id = :cid',
    ExpressionAttributeValues: {
      ':fid': farmer.farmerId,
      ':cid': params.id,
    },
    Limit: 1,
  });

  if (!chats.length) {
    redirect('/dashboard');
  }

  const chat = chats[0];
  const messages = Array.isArray(chat.messages) ? chat.messages : [];

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar farmerName={farmer.name} />
      <div className="max-w-4xl mx-auto px-4 py-6">
        <Link href="/dashboard" className="flex items-center gap-2 text-brand-600 hover:text-brand-700 mb-6 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="bg-white rounded-2xl shadow border border-gray-100 p-6">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-5 h-5 text-brand-600" />
            <h1 className="text-2xl font-bold text-gray-800">{chat.summary}</h1>
          </div>

          <p className="text-sm text-gray-500 mb-6">{formatDate(chat.timestamp)}</p>

          {chat.farming_context_tags && chat.farming_context_tags.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-6">
              {chat.farming_context_tags.map((tag: string) => (
                <span key={tag} className="text-xs bg-brand-100 text-brand-700 px-3 py-1 rounded-full">
                  {tag}
                </span>
              ))}
            </div>
          )}

          <div className="space-y-4">
            {messages.map((msg: { role: string; content: string }, idx: number) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-2xl px-4 py-3 rounded-lg ${
                    msg.role === 'user'
                      ? 'bg-brand-600 text-white rounded-br-none'
                      : 'bg-gray-100 text-gray-800 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
