export type ConfidenceBand = 'auto' | 'approval' | 'recommendation' | 'high-risk';

export type UploadedScriptKind =
  | 'new-test'
  | 'existing-test-update'
  | 'existing-workflow-update'
  | 'existing-locator-update'
  | 'accessibility-enhancement';

export interface LocatorModel {
  id: string;
  raw: string;
  strategy: 'role' | 'label' | 'placeholder' | 'text' | 'testId' | 'css' | 'xpath' | 'unknown';
  value: string;
  filePath?: string;
  owner?: string;
  score: number;
  warnings: string[];
}

export interface ActionModel {
  id: string;
  kind: string;
  locator?: LocatorModel;
  value?: string;
  line?: number;
}

export interface AssertionModel {
  id: string;
  kind: string;
  target: string;
  expected?: string;
  line?: number;
}

export interface WorkflowModel {
  id: string;
  name: string;
  intent: string;
  sourceFile?: string;
  actions: ActionModel[];
  assertions: AssertionModel[];
  navigation: string[];
  tags: string[];
  dataUsage: string[];
}

export interface PageObjectModel {
  name: string;
  filePath: string;
  className?: string;
  methods: string[];
  methodDetails: Array<{ name: string; parameterCount: number }>;
  locators: LocatorModel[];
}

export interface TestModel {
  name: string;
  filePath: string;
  workflows: string[];
  tags: string[];
  hasAccessibilityCoverage: boolean;
}

export interface FrameworkIndex {
  generatedAt: string;
  repositoryRoot: string;
  tests: TestModel[];
  workflows: WorkflowModel[];
  pageObjects: PageObjectModel[];
  locators: LocatorModel[];
  accessibility: TestModel[];
  tokenStats: TokenStats;
}

export interface SimilarityResult<T> {
  asset: T;
  score: number;
  evidence: string[];
}

export interface ConfidenceDecision {
  subject: string;
  score: number;
  band: ConfidenceBand;
  reasoningSummary: string;
  supportingEvidence: string[];
  retrievedAssetsUsed: string[];
  similarityMetrics: Record<string, number>;
  learningInfluence?: LearningInfluence;
}

export interface LearningInfluence {
  originalScore: number;
  finalScore: number;
  adjustment: number;
  factors: Array<{
    name: string;
    adjustment: number;
    evidence: string;
  }>;
  standardsApplied: string[];
  historicalPatterns: string[];
}

export interface GovernanceViolation {
  severity: 'blocker' | 'warning' | 'info';
  rule: string;
  message: string;
  filePath?: string;
  line?: number;
}

export interface GovernanceReport {
  passed: boolean;
  violations: GovernanceViolation[];
}

export interface ChangeImpactReport {
  risk: 'low' | 'medium' | 'high';
  createdFiles: string[];
  updatedFiles: string[];
  affectedTests: string[];
  affectedPageObjects: string[];
  reusedAssets: string[];
  summary: string;
  limitation: string;
}

export interface TokenStats {
  repositorySizeBytes: number;
  indexedFiles: number;
  retrievedFiles: number;
  estimatedTokensBeforeRetrieval: number;
  estimatedTokensAfterRetrieval: number;
  tokenReductionPercent: number;
  processingTimeMs: number;
  aiUsageBreakdown: Record<string, number>;
}

export interface ProposedChange {
  kind: UploadedScriptKind;
  confidence: ConfidenceDecision;
  governance: GovernanceReport;
  files: Array<{ path: string; content: string; action: 'create' | 'update' }>;
  auditSummary: string;
}
