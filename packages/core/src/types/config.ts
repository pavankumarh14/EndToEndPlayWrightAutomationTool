export interface PlatformConfig {
  repositoryRoot: string;
  scanRoots: string[];
  indexOutputPath: string;
  semanticProvider: 'none' | 'ollama' | 'gemini';
  ollama: {
    baseUrl: string;
    model: string;
    enabled: boolean;
  };
  gemini: {
    apiKey?: string;
    model: string;
  };
  confidence: {
    autoApply: number;
    approvalRequired: number;
    highRisk: number;
  };
}

export const defaultConfig = (repositoryRoot: string): PlatformConfig => ({
  repositoryRoot,
  scanRoots: ['tests', 'pages', 'components', 'fixtures', 'utils'],
  indexOutputPath: 'storage/indexes/framework-index.json',
  semanticProvider: resolveSemanticProvider(),
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.1',
    enabled: process.env.OLLAMA_ENABLED === 'true'
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL ?? 'gemini-2.5-flash'
  },
  confidence: {
    autoApply: 95,
    approvalRequired: 80,
    highRisk: 60
  }
});

function resolveSemanticProvider(): PlatformConfig['semanticProvider'] {
  const selected = process.env.AI_PROVIDER;
  if (selected === 'gemini' || selected === 'ollama' || selected === 'none') return selected;
  if (process.env.GEMINI_API_KEY) return 'gemini';
  return process.env.OLLAMA_ENABLED === 'true' ? 'ollama' : 'none';
}
