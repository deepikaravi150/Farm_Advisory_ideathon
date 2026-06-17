'use client';
import { useState, useRef, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Send, Bot, User, Loader2, Plus, Camera, FileText, X, ClipboardCheck, RotateCcw } from 'lucide-react';
import VoiceInput from './VoiceInput';
import VoiceOutput from './VoiceOutput';
import FormattedMessage from './FormattedMessage';

interface Message { role: 'user' | 'assistant'; content: string; imageUrl?: string; }

interface Props {
  initialMessages?: Message[];
  chatId?: string;
  chatTimestamp?: string;
  /** 'checkin' opens the chat as a daily field check-in. */
  mode?: 'checkin' | 'normal';
}

function checkinGreeting(locale: 'en' | 'hi' | 'ta') {
  if (locale === 'ta') return 'இன்றைய சோதனை! உங்கள் பயிர் எப்படி இருக்கிறது? பூச்சி, நீர் அல்லது வளர்ச்சியில் ஏதேனும் சிக்கல் உள்ளதா?';
  if (locale === 'hi') return 'आज की जांच! आपकी फसल कैसी है? कीट, पानी या बढ़त में कोई समस्या है?';
  return "Let's do today's check-in. How is your crop doing? Any issues with pests, water, or growth?";
}

export default function ChatPanel({ initialMessages = [], chatId, chatTimestamp, mode = 'normal' }: Props) {
  const t = useTranslations('chat');
  const appLocale = useLocale() as 'en' | 'hi' | 'ta';
  const [messages, setMessages] = useState<Message[]>(
    initialMessages.length ? initialMessages : mode === 'checkin' ? [{ role: 'assistant', content: checkinGreeting(appLocale) }] : [],
  );
  const [activeChatId, setActiveChatId] = useState<string | undefined>(chatId);
  const [activeChatTimestamp, setActiveChatTimestamp] = useState<string | undefined>(chatTimestamp);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [locale, setLocale] = useState<'en' | 'hi' | 'ta'>(appLocale);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (scrollAreaRef.current) scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
  }, [messages, loading, uploadingDoc]);
  useEffect(() => { setLocale(appLocale); }, [appLocale]);

  function onPickImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
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

  function historyForApi() {
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  // Soil report / document upload — reuses the soil extraction pipeline and
  // surfaces the plain-language summary as an assistant message in the chat.
  async function onPickDoc(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const userMsg: Message = {
      role: 'user',
      content: locale === 'ta' ? `மண் அறிக்கை பதிவேற்றப்பட்டது: ${file.name}` : locale === 'hi' ? `मिट्टी रिपोर्ट अपलोड: ${file.name}` : `Uploaded soil report: ${file.name}`,
    };
    setMessages((prev) => [...prev, userMsg]);
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('locale', locale);
      const res = await fetch('/api/soil/upload', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok || !data.soilData) {
        setMessages((prev) => [...prev, { role: 'assistant', content: typeof data.error === 'string' ? data.error : t('error') }]);
        return;
      }
      const s = data.soilData;
      let text = s.plainLanguageSummary || 'Your soil report has been saved and will now guide my advice.';
      if (Array.isArray(s.keyFindings) && s.keyFindings.length) {
        text += `\n\n**Key findings**\n${s.keyFindings.map((f: string) => `- ${f}`).join('\n')}`;
      }
      if (s.recommendations) text += `\n\n**Recommendation:** ${s.recommendations}`;
      setMessages((prev) => [...prev, { role: 'assistant', content: text }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: t('error') }]);
    } finally {
      setUploadingDoc(false);
    }
  }

  async function sendMessage(text?: string) {
    const msg = (text ?? input).trim();
    if (!msg && !imageFile) return;
    setInput('');

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
        form.append('mode', mode);
        form.append('history', JSON.stringify(historyForApi()));
        if (activeChatId) form.append('chatId', activeChatId);
        if (activeChatTimestamp) form.append('chatTimestamp', activeChatTimestamp);
        res = await fetch('/api/chat', { method: 'POST', body: form });
      } else {
        res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, locale, mode, history: historyForApi(), chatId: activeChatId, chatTimestamp: activeChatTimestamp }),
        });
      }
      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
        if (data.chatId) setActiveChatId(data.chatId);
        if (data.timestamp) setActiveChatTimestamp(data.timestamp);
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
    setMessages(mode === 'checkin' ? [{ role: 'assistant', content: checkinGreeting(locale) }] : []);
    setActiveChatId(undefined);
    setActiveChatTimestamp(undefined);
    setInput('');
    clearImage();
  }

  const attachHint = locale === 'ta' ? 'பயிர் புகைப்படம் (நோய் கண்டறிதல்)' : locale === 'hi' ? 'फसल फोटो (निदान)' : 'Crop photo (diagnosis)';
  const docHint = locale === 'ta' ? 'ஆவணம் / மண் அறிக்கை' : locale === 'hi' ? 'दस्तावेज़ / मिट्टी रिपोर्ट' : 'Document / Soil report';

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between bg-brand-700 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5" />
          <span className="font-semibold">{t('title')}</span>
          {mode === 'checkin' && (
            <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
              <ClipboardCheck className="h-3 w-3" /> Check-in
            </span>
          )}
        </div>
        <button onClick={startNewChat} title="New chat" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs hover:bg-white/15">
          <RotateCcw className="h-3.5 w-3.5" /> New
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollAreaRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {!messages.length && (
          <div className="py-12 text-center text-gray-400">
            <Bot className="mx-auto mb-3 h-12 w-12 text-brand-300" />
            <p className="text-sm">{t('emptyHint')}</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-100"><Bot className="h-4 w-4 text-brand-700" /></div>}
            <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user' ? 'rounded-tr-sm bg-brand-600 text-white' : 'rounded-tl-sm bg-gray-100 text-gray-800'}`}>
              {m.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={m.imageUrl} alt="crop" className="mb-1.5 max-h-48 w-full rounded-lg object-cover" />
              )}
              {m.content && (m.role === 'assistant' ? <FormattedMessage text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>)}
              {m.role === 'assistant' && <VoiceOutput text={m.content} locale={locale} />}
            </div>
            {m.role === 'user' && <div className="mt-1 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-brand-600"><User className="h-4 w-4 text-white" /></div>}
          </div>
        ))}
        {(loading || uploadingDoc) && (
          <div className="flex justify-start gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100"><Bot className="h-4 w-4 text-brand-700" /></div>
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2.5">
              <Loader2 className="h-4 w-4 animate-spin text-brand-600" />
              <span className="text-sm text-gray-500">{uploadingDoc ? (locale === 'ta' ? 'அறிக்கையை படிக்கிறது…' : locale === 'hi' ? 'रिपोर्ट पढ़ रहे हैं…' : 'Reading your report…') : t('thinking')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex-shrink-0 border-t border-gray-100 p-3">
        {imagePreview && (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-gray-50 p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imagePreview} alt="selected crop" className="h-12 w-12 rounded-lg object-cover" />
            <span className="flex-1 text-xs text-gray-500">
              {locale === 'ta' ? 'பயிர் புகைப்படம் இணைக்கப்பட்டது' : locale === 'hi' ? 'फसल फोटो जुड़ी' : 'Crop photo attached'}
            </span>
            <button type="button" onClick={clearImage} title="Remove" className="text-gray-400 hover:text-red-500"><X className="h-4 w-4" /></button>
          </div>
        )}
        <div className="flex items-end gap-2">
          {/* Attach menu */}
          <div className="relative flex-shrink-0">
            {attachOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setAttachOpen(false)} />
                <div className="absolute bottom-12 left-0 z-20 w-56 overflow-hidden rounded-xl border border-gray-100 bg-white shadow-lg">
                  <button
                    type="button"
                    onClick={() => { setAttachOpen(false); photoInputRef.current?.click(); }}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                  >
                    <Camera className="h-4 w-4 text-brand-600" /> {attachHint}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAttachOpen(false); docInputRef.current?.click(); }}
                    className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm hover:bg-gray-50"
                  >
                    <FileText className="h-4 w-4 text-brand-600" /> {docHint}
                  </button>
                </div>
              </>
            )}
            <button
              type="button"
              onClick={() => setAttachOpen((v) => !v)}
              title="Attach"
              className="rounded-xl bg-gray-100 p-2.5 text-gray-600 transition-colors hover:bg-gray-200"
            >
              <Plus className={`h-4 w-4 transition-transform ${attachOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>

          <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={onPickImage} className="hidden" />
          <input ref={docInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={onPickDoc} className="hidden" />

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={imageFile
              ? (locale === 'ta' ? 'கேள்வி சேர்க்கவும் (விருப்பம்)…' : locale === 'hi' ? 'सवाल जोड़ें (वैकल्पिक)…' : 'Add a question (optional)…')
              : t('placeholder')}
            rows={1}
            className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
          />
          <VoiceInput locale={locale} onTranscript={(text) => { setInput(text); sendMessage(text); }} />
          <button
            onClick={() => sendMessage()}
            disabled={(!input.trim() && !imageFile) || loading}
            className="flex-shrink-0 rounded-xl bg-brand-600 p-2.5 text-white transition-colors hover:bg-brand-700 disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
