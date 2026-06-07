'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { MessageSquare, Clock } from 'lucide-react';
import { formatDate } from '@/lib/utils';

interface ChatEntry { chat_id: string; timestamp: string; summary: string; farming_context_tags: string[]; }

export default function ChatSummaryWidget() {
  const [chats, setChats] = useState<ChatEntry[]>([]);
  const [translatedChats, setTranslatedChats] = useState<ChatEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useTranslations('recentChats');
  const locale = useLocale();
  const tagLabel = (tag: string) => {
    const labels: Record<string, { hi: string; ta: string }> = {
      tamil_nadu: { hi: 'तमिलनाडु', ta: 'தமிழ்நாடு' },
      crop_list: { hi: 'फसल सूची', ta: 'பயிர் பட்டியல்' },
      cereals: { hi: 'अनाज', ta: 'தானியங்கள்' },
      crop_farming: { hi: 'फसल खेती', ta: 'பயிர் விவசாயம்' },
      weather_forecast: { hi: 'मौसम पूर्वानुमान', ta: 'வானிலை முன்னறிவிப்பு' },
      drizzle: { hi: 'फुहार', ta: 'தூறல்' },
      temperature: { hi: 'तापमान', ta: 'வெப்பநிலை' },
    };
    if (locale === 'en') return tag.replaceAll('_', ' ');
    return labels[tag]?.[locale as 'hi' | 'ta'] ?? tag.replaceAll('_', ' ');
  };

  useEffect(() => {
    fetch('/api/chat').then(r => r.json()).then(data => {
      setChats(Array.isArray(data) ? data.slice(0, 3) : []);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setTranslatedChats(null);
    if (locale === 'en' || !chats.length) return;

    fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        locale,
        kind: 'crop_plan',
        payload: chats.map((chat) => ({
          chat_id: chat.chat_id,
          timestamp: chat.timestamp,
          summary: chat.summary,
          farming_context_tags: chat.farming_context_tags,
        })),
      }),
    })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('translate failed')))
      .then((data) => {
        if (!cancelled && Array.isArray(data.payload)) {
          setTranslatedChats(data.payload as ChatEntry[]);
        }
      })
      .catch(() => {
        if (!cancelled) setTranslatedChats(null);
      });

    return () => {
      cancelled = true;
    };
  }, [chats, locale]);

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-white p-5 shadow" />;

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <MessageSquare className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('title')}</h3>
      </div>
      <div className="divide-y divide-gray-50">
        {!chats.length && (
          <p className="p-4 text-sm text-gray-400 text-center">{t('empty')}</p>
        )}
        {(translatedChats ?? chats).map(chat => (
          <Link key={chat.chat_id} href={`/dashboard?chat=${encodeURIComponent(chat.chat_id)}`} className="block p-4 hover:bg-brand-50 transition-colors">
            <p className="text-sm text-gray-700">{chat.summary}</p>
            <div className="flex items-center justify-between mt-2">
              <div className="flex gap-1 flex-wrap">
                {(chat.farming_context_tags ?? []).slice(0, 3).map(tag => (
                  <span key={tag} className="text-xs bg-brand-100 text-brand-700 px-2 py-0.5 rounded-full">{tagLabel(tag)}</span>
                ))}
              </div>
              <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                <Clock className="w-3 h-3" />{formatDate(chat.timestamp)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
