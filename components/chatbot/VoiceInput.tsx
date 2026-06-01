'use client';
import { useState, useRef } from 'react';
import { Mic, MicOff, Loader2 } from 'lucide-react';

interface VoiceInputProps { locale: string; onTranscript: (text: string) => void; }

export default function VoiceInput({ locale, onTranscript }: VoiceInputProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = e => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        setRecording(false);
        setProcessing(true);
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const form = new FormData();
        form.append('audio', blob, 'audio.webm');
        form.append('locale', locale);
        try {
          const res = await fetch('/api/speech/transcribe', { method: 'POST', body: form });
          const data = await res.json();
          if (data.transcript) onTranscript(data.transcript);
        } catch { /* silent */ }
        finally { setProcessing(false); }
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch { alert('Microphone access denied.'); }
  }

  if (processing) return <div className="p-2.5"><Loader2 className="w-4 h-4 animate-spin text-brand-600" /></div>;

  return (
    <button onClick={toggleRecording}
      className={`p-2.5 rounded-xl transition-colors flex-shrink-0 ${recording ? 'bg-red-500 text-white animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
      title={recording ? 'Stop recording' : 'Start voice input'}>
      {recording ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
