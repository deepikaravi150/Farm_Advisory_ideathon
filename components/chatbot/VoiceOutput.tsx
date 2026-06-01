'use client';
import { useState } from 'react';
import { Volume2, VolumeX, Loader2 } from 'lucide-react';

interface VoiceOutputProps { text: string; locale: string; }

export default function VoiceOutput({ text, locale }: VoiceOutputProps) {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useState<HTMLAudioElement | null>(null);

  async function speak() {
    if (playing) { audioRef[0]?.pause(); setPlaying(false); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/speech/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 1000), locale }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      (audioRef as unknown as [HTMLAudioElement | null, (a: HTMLAudioElement | null) => void])[1](audio);
      audio.onended = () => setPlaying(false);
      await audio.play();
      setPlaying(true);
    } finally { setLoading(false); }
  }

  if (loading) return <button className="mt-1 text-gray-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /></button>;

  return (
    <button onClick={speak} className="mt-1 text-gray-400 hover:text-brand-600 transition-colors" title="Listen">
      {playing ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
    </button>
  );
}
