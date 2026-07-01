const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function uploadScript(source: string, fileName = 'upload.spec.ts'): Promise<AnalysisResponse> {
  const response = await apiPost<AnalysisResponse>('/api/analysis/upload', { source, fileName });
  return response;
}

export interface AnalysisResponse {
  parsed: { workflows: Array<{ name: string; intent: string; actions: unknown[]; assertions: unknown[] }> };
  confidence: {
    score: number;
    band: string;
    reasoningSummary: string;
    supportingEvidence: string[];
    retrievedAssetsUsed: string[];
    similarityMetrics: Record<string, number>;
    learningInfluence?: {
      originalScore: number;
      finalScore: number;
      adjustment: number;
      factors: Array<{ name: string; adjustment: number; evidence: string }>;
      standardsApplied: string[];
      historicalPatterns: string[];
    };
  };
  governance: { passed: boolean; violations: Array<{ severity: string; rule: string; message: string; filePath?: string }> };
  quality: { passed: boolean; checks: Array<{ name: string; passed: boolean; details: string }> };
  retrieval: { tokenEstimate: number; workflows: unknown[]; pageObjects: unknown[]; tests: unknown[]; evidence: string[] };
  proposedChange: { kind: string; files: Array<{ path: string; content: string; action: string }>; auditSummary: string };
}

export interface FrameworkIndex {
  generatedAt: string;
  tests: unknown[];
  workflows: unknown[];
  pageObjects: unknown[];
  locators: unknown[];
  accessibility: unknown[];
  tokenStats: {
    repositorySizeBytes: number;
    indexedFiles: number;
    retrievedFiles: number;
    estimatedTokensBeforeRetrieval: number;
    estimatedTokensAfterRetrieval: number;
    tokenReductionPercent: number;
    processingTimeMs: number;
    aiUsageBreakdown: Record<string, number>;
  };
}

export interface LearningDashboardResponse {
  profile: {
    generatedAt: string;
    preferredLocatorStrategy: string;
    preferredAssertionStyle: string;
    preferredPageObjectPattern: string;
    preferredAccessibilityRules: string;
    preferredWaitingStrategy: string;
    teamStandards: string[];
    historicalOutcomes: {
      accepted: number;
      rejected: number;
      modified: number;
      successfulExecutions: number;
      failedExecutions: number;
    };
  };
  mostAcceptedRecommendations: Array<{ pattern: string; count: number; acceptanceRate: number }>;
  mostRejectedRecommendations: Array<{ pattern: string; count: number; acceptanceRate: number }>;
  topTeamStandards: string[];
  confidenceAccuracyTrends: Array<{ bucket: string; acceptanceRate: number; count: number }>;
  selfHealingSuccessRate: number;
  frameworkEvolutionTrends: Array<{ pattern: string; count: number; acceptanceRate: number }>;
  tokenReductionTrends: Array<{ timestamp: string; reductionPercent: number }>;
  governanceComplianceTrends: Array<{ rule: string; acceptedOverrides: number; rejectedOverrides: number }>;
}
