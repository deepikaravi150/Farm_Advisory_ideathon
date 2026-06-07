'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Send, Loader2, MessageSquareText } from 'lucide-react';

interface DraftResponse {
  available: boolean;
  reason?: string;
  language?: string;
  phone?: string;
  message?: string;
}

export default function DailySmsWidget() {
  const locale = useLocale();
  const t = (en: string, hi: string, ta: string) => (locale === 'ta' ? ta : locale === 'hi' ? hi : en);
  const languageName = (code?: string) => {
    if (code === 'ta') return 'தமிழ்';
    if (code === 'hi') return 'हिन्दी';
    return 'English';
  };
  const [draft, setDraft] = useState<DraftResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setStatus('');
    setError('');
    fetch(`/api/daily-sms?locale=${encodeURIComponent(locale)}`, { cache: 'no-store' })
      .then((res) => res.ok ? res.json() : Promise.reject(new Error('draft unavailable')))
      .then(setDraft)
      .catch(() => setDraft({ available: false, reason: 'draft_unavailable' }))
      .finally(() => setLoading(false));
  }, [locale]);

  async function sendSms() {
    setSending(true);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/daily-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : t('Could not send SMS', 'SMS नहीं भेजा जा सका', 'SMS அனுப்ப முடியவில்லை'));
        return;
      }
      setStatus(t('SMS sent to farmer.', 'किसान को SMS भेजा गया।', 'விவசாயிக்கு SMS அனுப்பப்பட்டது.'));
      setDraft((current) => current ? { ...current, message: data.message ?? current.message } : current);
    } catch {
      setError(t('Could not send SMS', 'SMS नहीं भेजा जा सका', 'SMS அனுப்ப முடியவில்லை'));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow">
      <div className="flex items-center gap-2 p-4 border-b border-gray-100">
        <MessageSquareText className="w-4 h-4 text-brand-600" />
        <h3 className="font-semibold text-gray-700">{t('Daily SMS Draft', 'दैनिक SMS मसौदा', 'தினசரி SMS வரைவு')}</h3>
      </div>
      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-5 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('Preparing SMS...', 'SMS तैयार हो रहा है...', 'SMS தயார் செய்யப்படுகிறது...')}
          </div>
        ) : draft?.available && draft.message ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch">
            <div className="min-w-0 flex-1 rounded-xl bg-gray-50 p-3 text-sm leading-6 text-gray-700 whitespace-pre-wrap">
              {draft.message}
            </div>
            <div className="flex shrink-0 flex-col justify-between gap-3 rounded-xl border border-gray-100 bg-white p-3 lg:w-[260px]">
              <p className="text-xs text-gray-400">
                {t('Language', 'भाषा', 'மொழி')}: {languageName(draft.language)} · {t('To', 'प्रति', 'பெறுநர்')}: +91 {draft.phone}
              </p>
              <button
                type="button"
                onClick={sendSms}
                disabled={sending}
                className="inline-flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {sending ? t('Sending', 'भेज रहा है', 'அனுப்புகிறது') : t('Send', 'भेजें', 'அனுப்பு')}
              </button>
            </div>
          </div>
        ) : (
          <p className="py-4 text-center text-sm text-gray-400">
            {t('No active crop plan found. Make a crop plan active to prepare daily SMS.', 'सक्रिय फसल योजना नहीं मिली। दैनिक SMS तैयार करने के लिए योजना सक्रिय करें।', 'செயலில் உள்ள பயிர் திட்டம் இல்லை. தினசரி SMS தயார் செய்ய ஒரு திட்டத்தை செயலில் மாற்றவும்.')}
          </p>
        )}
        {status && <p className="mt-2 text-xs font-medium text-brand-600">{status}</p>}
        {error && <p className="mt-2 text-xs font-medium text-red-500">{error}</p>}
      </div>
    </div>
  );
}
