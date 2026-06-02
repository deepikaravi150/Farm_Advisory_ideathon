import {
  TranscribeStreamingClient,
  StartStreamTranscriptionCommand,
  LanguageCode,
} from '@aws-sdk/client-transcribe-streaming';

const transcribeClient = new TranscribeStreamingClient({
  region: process.env.AWS_REGION ?? 'ap-south-1',
});

const LANGUAGE_MAP: Record<string, LanguageCode> = {
  en: LanguageCode.EN_IN,
  hi: LanguageCode.HI_IN,
  ta: LanguageCode.TA_IN,
};

export async function transcribeAudio(
  audioBuffer: Buffer,
  locale: string
): Promise<string> {
  const languageCode = LANGUAGE_MAP[locale] ?? LanguageCode.EN_IN;

  async function* audioStream() {
    const chunkSize = 8192;
    for (let i = 0; i < audioBuffer.length; i += chunkSize) {
      yield { AudioEvent: { AudioChunk: audioBuffer.slice(i, i + chunkSize) } };
    }
  }

  const command = new StartStreamTranscriptionCommand({
    LanguageCode: languageCode,
    MediaEncoding: 'pcm',
    MediaSampleRateHertz: 16000,
    AudioStream: audioStream(),
  });

  const response = await transcribeClient.send(command);
  const transcripts: string[] = [];

  if (response.TranscriptResultStream) {
    for await (const event of response.TranscriptResultStream) {
      if (event.TranscriptEvent?.Transcript?.Results) {
        for (const result of event.TranscriptEvent.Transcript.Results) {
          if (!result.IsPartial && result.Alternatives?.[0]?.Transcript) {
            transcripts.push(result.Alternatives[0].Transcript);
          }
        }
      }
    }
  }

  return transcripts.join(' ').trim();
}
