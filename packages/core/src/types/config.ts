export interface PlatformConfig {
  repositoryRoot: string;
  scanRoots: string[];
  indexOutputPath: string;
  ollama: {
    baseUrl: string;
    model: string;
    enabled: boolean;
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
  ollama: {
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434',
    model: process.env.OLLAMA_MODEL ?? 'llama3.1',
    enabled: process.env.OLLAMA_ENABLED === 'true'
  },
  confidence: {
    autoApply: 95,
    approvalRequired: 80,
    highRisk: 60
  }
});
