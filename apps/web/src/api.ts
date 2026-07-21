const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`);
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<T>;
}

async function responseError(response: Response): Promise<string> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { message?: unknown; error?: unknown; detail?: unknown };
    const message = parsed.message ?? parsed.error ?? parsed.detail;
    if (typeof message === 'string') return message;
  } catch {
    // Keep the response body as the fallback message.
  }
  return body || `Request failed with status ${response.status}.`;
}

export function uploadScript(
  source: string,
  fileName = 'upload.spec.ts',
  stagedFiles: Array<{ path: string; content: string }> = [],
  workflowName = ''
): Promise<AnalysisResponse> {
  return apiPost<AnalysisResponse>('/api/analysis/upload', { source, fileName, stagedFiles, workflowName });
}

export interface RecordingSession {
  id: string;
  url: string;
  status: 'starting' | 'running' | 'stopped' | 'exited' | 'failed';
  createdAt: string;
  updatedAt: string;
  exitCode?: number | null;
  error?: string;
  generatedSource: string;
  editedSource: string;
}

export function startRecording(url: string): Promise<RecordingSession> {
  return apiPost('/api/recording/sessions', { url });
}

export function getRecording(id: string): Promise<RecordingSession> {
  return apiGet(`/api/recording/sessions/${id}`);
}

export function stopRecording(id: string): Promise<RecordingSession> {
  return apiPost(`/api/recording/sessions/${id}/stop`);
}

export function saveRecording(id: string, source: string): Promise<RecordingSession> {
  return apiPost(`/api/recording/sessions/${id}/save`, { source });
}

export interface PullRequestReadiness {
  ready: boolean;
  branch?: string;
  baseBranch?: string;
  remote?: string;
  existingPullRequest?: { url: string; branch: string; isDraft: boolean };
  blockers: string[];
}

export interface CreatedPullRequest {
  url: string;
  branch: string;
  baseBranch: string;
  commit: string;
  updated: boolean;
  returnedToDefaultBranch: boolean;
}

export interface ClosedPullRequest {
  url: string;
  branch: string;
  remoteBranchDeleted: boolean;
}

export function getPullRequestReadiness(): Promise<PullRequestReadiness> {
  return apiGet('/api/git/pull-request-readiness');
}

export function createPullRequest(input: { files: string[]; title: string; body: string }): Promise<CreatedPullRequest> {
  return apiPost('/api/git/pull-request', input);
}

export function closePullRequest(input: { url: string; branch: string; deleteRemoteBranch: boolean }): Promise<ClosedPullRequest> {
  return apiPost('/api/git/pull-request/close', input);
}

export function setGitRemote(remote: string): Promise<PullRequestReadiness> {
  return apiPost('/api/git/remote', { remote });
}

export function startGitHubLogin(): Promise<{ started: boolean; message: string }> {
  return apiPost('/api/git/auth/login');
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
  impact: {
    risk: 'low' | 'medium' | 'high';
    createdFiles: string[];
    updatedFiles: string[];
    affectedTests: string[];
    affectedPageObjects: string[];
    reusedAssets: string[];
    summary: string;
    limitation: string;
  };
  quality: { passed: boolean; checks: Array<{ name: string; passed: boolean; details: string }> };
  semanticReview?: {
    provider: 'none' | 'ollama' | 'gemini';
    model?: string;
    status: 'used' | 'fallback' | 'not-enabled';
    message?: string;
  };
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
