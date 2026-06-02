'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight, MessageSquare, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ChatEntry { chat_id: string; timestamp: string; summary: string; farming_context_tags: string[]; }

export default function ChatSummaryWidget() {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/chat').then(r => r.json()).then(data => {
      setChats(Array.isArray(data) ? data.slice(0, 3) : []);
    }).finally(() => setLoading(false));
  }, []);

  const handleChatClick = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  if (loading) return <div className="bg-white rounded-2xl p-5 shadow animate-pulse h-40" />;

  return (
    <div className="bg-white rounded-2xl shadow border border-gray-100">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <MessageSquare className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">Recent Chats</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {!chats.length && (
          <p className="p-4 text-sm text-gray-400 text-center">No conversations yet. Start chatting!</p>
        )}
        {chats.map(chat => (
          <button
            key={chat.chat_id}
            onClick={() => handleChatClick(chat.chat_id)}
            className="group w-full p-4 text-left hover:bg-brand-50 focus:bg-brand-50 focus:outline-none focus:ring-2 focus:ring-brand-300 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-full bg-brand-100 p-2 text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-800 line-clamp-2 group-hover:text-brand-800">{chat.summary}</p>
                <div className="flex items-center justify-between mt-2 gap-3">
                  <div className="flex gap-1 flex-wrap">
                    {(chat.farming_context_tags ?? []).slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                    <Clock className="w-3 h-3" />{formatDate(chat.timestamp)}
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-brand-600 transition-colors mt-1 flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
