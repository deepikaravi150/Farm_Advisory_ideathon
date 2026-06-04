'use client';
import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send, Bot, User, Loader2, Sparkles, Check, X } from 'lucide-react';
import VoiceInput from '@/components/chatbot/VoiceInput';
import VoiceOutput from '@/components/chatbot/VoiceOutput';
import type { CropPlan } from '@/lib/types/crop-plan';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  proposal?: CropPlan | null;
}

interface Props {
  plan: CropPlan;
  onApply: (plan: CropPlan) => void;
}

export default function PlanChatPanel({ plan, onApply }: Props) {
  const t = useTranslations('planChat');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const locale = useLocale() as 'en' | 'hi' | 'ta';
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: msg }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch('/api/crop-plan/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, locale, plan, history: messages.slice(-6).map(({ role, content }) => ({ role, content })) }),
      });
      const data = await res.json();
      setMessages([...next, { role: 'assistant', content: data.reply || t('error'), proposal: data.updatedPlan ?? null }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: t('error') }]);
    } finally {
      setLoading(false);
    }
  }

  function applyProposal(idx: number, proposal: CropPlan) {
    onApply(proposal);
    // Mark this proposal as applied so the Apply/Dismiss buttons disappear.
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, proposal: null, content: `${m.content}\n\n✅ ${t('applied')}` } : m)));
  }

  function dismissProposal(idx: number) {
    setMessages((prev) => prev.map((m, i) => (i === idx ? { ...m, proposal: null } : m)));
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-gradient-to-r from-brand-700 to-emerald-600 text-white p-4 flex items-center gap-2 flex-shrink-0">
        <Sparkles className="w-5 h-5" />
        <div>
          <p className="font-semibold leading-tight">{t('title')}</p>
          <p className="text-xs text-white/80">{t('subtitle')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!messages.length && (
          <div className="text-center text-gray-400 py-10">
            <Bot className="w-10 h-10 mx-auto mb-3 text-brand-300" />
            <p className="text-sm">{t('emptyHint')}</p>
            <div className="mt-4 space-y-2">
              {(t.raw('examples') as string[]).map((ex) => (
                <button key={ex} onClick={() => send(ex)}
                  className="block w-full text-left text-xs bg-brand-50 text-brand-700 rounded-lg px-3 py-2 hover:bg-brand-100">
                  “{ex}”
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-4 h-4 text-brand-700" /></div>}
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && <VoiceOutput text={m.content} locale={locale} />}
              {m.proposal && (
                <div className="mt-3 border-t border-gray-200 pt-2">
                  <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-brand-600" />{t('proposedChange', { stages: m.proposal.milestones?.length ?? 0 })}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => applyProposal(i, m.proposal!)}
                      className="flex-1 bg-brand-600 text-white rounded-lg py-1.5 text-xs font-medium hover:bg-brand-700 flex items-center justify-center gap-1">
                      <Check className="w-3.5 h-3.5" />{t('apply')}
                    </button>
                    <button onClick={() => dismissProposal(i)}
                      className="flex-1 bg-gray-200 text-gray-700 rounded-lg py-1.5 text-xs font-medium hover:bg-gray-300 flex items-center justify-center gap-1">
                      <X className="w-3.5 h-3.5" />{t('dismiss')}
                    </button>
                  </div>
                </div>
              )}
            </div>
            {m.role === 'user' && <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-1"><User className="w-4 h-4 text-white" /></div>}
          </div>
        ))}

        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center"><Bot className="w-4 h-4 text-brand-700" /></div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span className="text-sm text-gray-500">{t('thinking')}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea value={input} onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={t('placeholder')} rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <VoiceInput locale={locale} onTranscript={(text) => { setInput(text); send(text); }} />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="bg-brand-600 text-white rounded-xl p-2.5 hover:bg-brand-700 disabled:opacity-40 transition-colors flex-shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
