export interface SemanticDecisionRequest {
  task: string;
  workflowSummary: string;
  retrievedAssets: unknown;
  similarityResults: unknown;
}

export interface SemanticDecisionResponse {
  score: number;
  reasoningSummary: string;
  selectedAsset?: string;
}

export class OllamaClient {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly enabled: boolean
  ) {}

  async decide(request: SemanticDecisionRequest): Promise<SemanticDecisionResponse | undefined> {
    if (!this.enabled) return undefined;
    const prompt = [
      'You are a semantic QA automation reviewer. Do not generate code.',
      'Return JSON only with score, reasoningSummary, and selectedAsset.',
      JSON.stringify(request)
    ].join('\n');

    const response = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: this.model, prompt, stream: false, format: 'json' })
    });
    if (!response.ok) throw new Error(`Ollama request failed: ${response.status}`);
    const payload = (await response.json()) as { response?: string };
    return JSON.parse(payload.response ?? '{}') as SemanticDecisionResponse;
  }
}
