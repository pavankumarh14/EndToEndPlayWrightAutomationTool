import { SemanticDecisionRequest, SemanticDecisionResponse } from '../ollama/ollamaClient.js';

export class GeminiClient {
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model: string
  ) {}

  async decide(request: SemanticDecisionRequest): Promise<SemanticDecisionResponse> {
    if (!this.apiKey) throw new Error('Gemini is selected, but GEMINI_API_KEY is not configured. Add it to your local .env file.');
    const prompt = [
      'You are a semantic QA automation reviewer. Do not generate code.',
      'Return JSON only with a score from 0 to 100, a concise reasoningSummary, and an optional selectedAsset.',
      JSON.stringify(request)
    ].join('\n');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': this.apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' }
        })
      }
    );
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini request failed (${response.status}): ${errorText.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
    const decision = JSON.parse(text) as Partial<SemanticDecisionResponse>;
    if (typeof decision.score !== 'number' || typeof decision.reasoningSummary !== 'string') {
      throw new Error('Gemini returned an invalid semantic-review response.');
    }
    return {
      score: Math.max(0, Math.min(100, Math.round(decision.score))),
      reasoningSummary: decision.reasoningSummary,
      selectedAsset: typeof decision.selectedAsset === 'string' ? decision.selectedAsset : undefined
    };
  }
}
