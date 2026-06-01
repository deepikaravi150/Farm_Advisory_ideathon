'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import VoiceInput from './VoiceInput';
import VoiceOutput from './VoiceOutput';
import Cookies from 'js-cookie';

interface Message { role: 'user' | 'assistant'; content: string; }

export default function ChatPanel() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<'en' | 'hi' | 'ta'>(() => (Cookies.get('locale') as 'en' | 'hi' | 'ta') ?? 'en');
  const [lastReply, setLastReply] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg) return;
    setInput('');
    const newMessages = [...messages, { role: 'user' as const, content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, locale, history: messages.slice(-6) }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        setLastReply(data.reply);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  const placeholders = { en: 'Ask about your crops...', hi: 'अपनी फसल के बारे में पूछें...', ta: 'உங்கள் பயிரைப் பற்றி கேளுங்கள்...' };

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-brand-700 text-white p-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <span className="font-semibold">Farm Advisor Chat</span>
        </div>
        <select value={locale} onChange={e => { setLocale(e.target.value as typeof locale); Cookies.set('locale', e.target.value); }}
          className="bg-brand-600 text-white text-sm rounded px-2 py-1 border border-brand-500">
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
          <option value="ta">தமிழ்</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {!messages.length && (
          <div className="text-center text-gray-400 py-12">
            <Bot className="w-12 h-12 mx-auto mb-3 text-brand-300" />
            <p className="text-sm">Ask me anything about farming, crops, weather, or market prices.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-4 h-4 text-brand-700" /></div>}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
              <p className="whitespace-pre-wrap">{m.content}</p>
              {m.role === 'assistant' && <VoiceOutput text={m.content} locale={locale} />}
            </div>
            {m.role === 'user' && <div className="w-7 h-7 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0 mt-1"><User className="w-4 h-4 text-white" /></div>}
          </div>
        ))}
        {loading && (
          <div className="flex gap-2 justify-start">
            <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center"><Bot className="w-4 h-4 text-brand-700" /></div>
            <div className="bg-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
              <span className="text-sm text-gray-500">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={placeholders[locale]} rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <VoiceInput locale={locale} onTranscript={text => { setInput(text); sendMessage(text); }} />
          <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
            className="bg-brand-600 text-white rounded-xl p-2.5 hover:bg-brand-700 disabled:opacity-40 transition-colors flex-shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
