/**
 * Crop-doctor (leaf/plant photo diagnosis) helpers, shared by the chat route.
 * The vision call itself lives in `lib/ai/openai.ts` (extractTextFromDocument).
 */

export interface Diagnosis {
  isPlant: boolean;
  cropName?: string | null;
  healthy?: boolean;
  diagnosis?: string | null;
  severity?: string | null;
  confidence?: string | null;
  symptoms?: string[] | null;
  cause?: string | null;
  treatment?: string[] | null;
  prevention?: string[] | null;
  plainSummary?: string | null;
}

function outputLanguage(locale: string) {
  if (locale === 'ta') return 'Tamil';
  if (locale === 'hi') return 'Hindi';
  return 'English';
}

/** Vision prompt: diagnose a crop photo and return structured JSON. */
export function buildDiagnosisPrompt(locale: string) {
  const language = outputLanguage(locale);
  return `You are a plant doctor for Tamil Nadu farmers. Look at this photo of a crop/plant and diagnose any pest, disease, or nutrient problem.

Return ONLY a valid JSON object with exactly this structure:
{
  "isPlant": true,
  "cropName": "best guess of the crop, or null if unclear",
  "healthy": false,
  "diagnosis": "short name of the problem, e.g. Leaf blight (fungal) — or 'Healthy plant' if no problem",
  "severity": "low/medium/high",
  "confidence": "low/medium/high",
  "symptoms": ["short visible symptom 1", "short visible symptom 2"],
  "cause": "what causes this problem, in simple words",
  "treatment": ["practical step 1 (prefer low-cost/organic first)", "step 2", "chemical option with example if needed"],
  "prevention": ["how to avoid it next time 1", "tip 2"],
  "plainSummary": "1-2 sentences a farmer can act on immediately"
}

Rules:
- If the image is NOT a plant/crop, set isPlant=false and put a short note in plainSummary; leave other fields null/empty.
- Do not invent a pesticide dose you are unsure of; recommend confirming with a local agri shop.
- Keep JSON keys in English.
- Write these farmer-facing fields in ${language}: diagnosis, symptoms, cause, treatment, prevention, plainSummary, cropName.
- Keep severity/confidence values as low/medium/high in English.
- Return only valid JSON, no markdown.`;
}

/** Pull the JSON object out of a raw model response. Throws if none is found. */
export function parseDiagnosis(raw: string): Diagnosis {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI did not return a readable diagnosis.');
  return JSON.parse(match[0]) as Diagnosis;
}

/**
 * Turn a diagnosis into a system-prompt block so the chat LLM can give a
 * conversational answer that also weaves in soil/weather/memory context.
 */
export function formatDiagnosisForPrompt(d: Diagnosis): string {
  if (d.isPlant === false) {
    return `Crop photo analysis: the image does not look like a crop/plant${d.plainSummary ? ` (${d.plainSummary})` : ''}. Ask the farmer to share a clear close-up of the affected leaves or plant.`;
  }
  const lines: string[] = ['Crop photo analysis (from the vision model):'];
  const status = d.healthy ? 'looks healthy' : 'shows a problem';
  lines.push(`- Crop: ${d.cropName ?? 'unknown'}; Status: ${status}; Severity: ${d.severity ?? 'unknown'}; Confidence: ${d.confidence ?? 'unknown'}`);
  if (d.diagnosis) lines.push(`- Problem: ${d.diagnosis}`);
  if (d.symptoms?.length) lines.push(`- Symptoms: ${d.symptoms.join('; ')}`);
  if (d.cause) lines.push(`- Likely cause: ${d.cause}`);
  if (d.treatment?.length) lines.push(`- Suggested treatment: ${d.treatment.join('; ')}`);
  if (d.prevention?.length) lines.push(`- Prevention: ${d.prevention.join('; ')}`);
  if (d.plainSummary) lines.push(`- Summary: ${d.plainSummary}`);
  return lines.join('\n');
}
