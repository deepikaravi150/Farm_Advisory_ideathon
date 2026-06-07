'use client';
import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send, Bot, User, Loader2, Plus, Camera, X } from 'lucide-react';
import VoiceInput from './VoiceInput';
import VoiceOutput from './VoiceOutput';
import FormattedMessage from './FormattedMessage';

interface Message { role: 'user' | 'assistant'; content: string; imageUrl?: string; }

interface Props {
  initialMessages?: Message[];
  chatId?: string;
  chatTimestamp?: string;
}

export default function ChatPanel({ initialMessages = [], chatId, chatTimestamp }: Props) {
  const t = useTranslations('chat');
  const appLocale = useLocale() as 'en' | 'hi' | 'ta';
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [activeChatId, setActiveChatId] = useState<string | undefined>(chatId);
  const [activeChatTimestamp, setActiveChatTimestamp] = useState<string | undefined>(chatTimestamp);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [locale, setLocale] = useState<'en' | 'hi' | 'ta'>(appLocale);
  const [lastReply, setLastReply] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages, loading]);
  useEffect(() => { setLocale(appLocale); }, [appLocale]);
  useEffect(() => {
    setMessages(initialMessages);
    setActiveChatId(chatId);
    setActiveChatTimestamp(chatTimestamp);
  }, [initialMessages, chatId, chatTimestamp]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-picking the same file
    if (!file) return;
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearImage() {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
  }

  // Plain {role,content} history for the API (drop local-only fields like imageUrl).
  function historyForApi() {
    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg && !imageFile) return;
    setInput('');

    // Hand the preview URL to the rendered message; ownership transfers so we
    // don't revoke it here.
    const sentImage = imageFile;
    const sentPreview = imagePreview;
    setImageFile(null);
    setImagePreview(null);

    const userMsg: Message = { role: 'user', content: msg, imageUrl: sentPreview ?? undefined };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setLoading(true);
    try {
      let res: Response;
      if (sentImage) {
        const form = new FormData();
        form.append('file', sentImage);
        form.append('message', msg);
        form.append('locale', locale);
        form.append('history', JSON.stringify(historyForApi()));
        if (activeChatId) form.append('chatId', activeChatId);
        if (activeChatTimestamp) form.append('chatTimestamp', activeChatTimestamp);
        // No Content-Type header — the browser sets the multipart boundary.
        res = await fetch('/api/chat', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, locale, history: historyForApi(), chatId: activeChatId, chatTimestamp: activeChatTimestamp }),
        });
      }
      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        if (data.chatId) setActiveChatId(data.chatId);
        if (data.timestamp) setActiveChatTimestamp(data.timestamp);
        setLastReply(data.reply);
      } else {
        setMessages([...newMessages, { role: 'assistant', content: typeof data.error === 'string' ? data.error : t('error') }]);
      }
    } catch {
      setMessages([...newMessages, { role: 'assistant', content: t('error') }]);
    } finally {
      setLoading(false);
    }
  }

  function startNewChat() {
    setMessages([]);
    setActiveChatId(undefined);
    setActiveChatTimestamp(undefined);
    setInput('');
    setLastReply('');
    clearImage();
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <div className="bg-brand-700 text-white p-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          <span className="font-semibold">{t('title')}</span>
        </div>
      </div>

      <div ref={scrollAreaRef} className="flex-1 overflow-y-auto p-4 space-y-3">
        {!messages.length && (
          <div className="text-center text-gray-400 py-12">
            <Bot className="w-12 h-12 mx-auto mb-3 text-brand-300" />
            <p className="text-sm">{t('emptyHint')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center flex-shrink-0 mt-1"><Bot className="w-4 h-4 text-brand-700" /></div>}
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-gray-100 text-gray-800 rounded-tl-sm'}`}>
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="crop" className="mb-1.5 max-h-48 w-full rounded-lg object-cover" />
              )}
              {m.content && (m.role === 'assistant' ? <FormattedMessage text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>)}
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
              <span className="text-sm text-gray-500">{t('thinking')}</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="p-3 border-t border-gray-100 flex-shrink-0">
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="selected crop" className="h-12 w-12 rounded-lg object-cover" />
            <span className="flex-1 text-xs text-gray-500">
              {locale === 'ta' ? 'பயிர் புகைப்படம் இணைக்கப்பட்டது' : locale === 'hi' ? 'फसल फोटो जुड़ी' : 'Crop photo attached'}
            </span>
            <button type="button" onClick={clearImage} title="Remove" className="text-gray-400 hover:text-red-500">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="flex gap-2 items-end">
          <button
            type="button"
            onClick={startNewChat}
            title="New chat"
            className="bg-brand-600 text-white rounded-xl p-2.5 hover:bg-brand-700 transition-colors flex-shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={imageFile
              ? (locale === 'ta' ? 'கேள்வி சேர்க்கவும் (விருப்பம்)…' : locale === 'hi' ? 'सवाल जोड़ें (वैकल्पिक)…' : 'Add a question (optional)…')
              : t('placeholder')}
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={onPickImage}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title={locale === 'ta' ? 'பயிர் புகைப்படம்' : locale === 'hi' ? 'फसल फोटो' : 'Crop photo'}
            className="bg-gray-100 text-gray-600 rounded-xl p-2.5 hover:bg-gray-200 transition-colors flex-shrink-0"
          >
            <Camera className="w-4 h-4" />
          </button>
          <VoiceInput locale={locale} onTranscript={text => { setInput(text); sendMessage(text); }} />
          <button onClick={() => sendMessage()} disabled={(!input.trim() && !imageFile) || loading}
            className="bg-brand-600 text-white rounded-xl p-2.5 hover:bg-brand-700 disabled:opacity-40 transition-colors flex-shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
