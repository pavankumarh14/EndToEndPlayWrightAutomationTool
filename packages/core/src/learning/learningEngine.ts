import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ConfidenceDecision, LearningInfluence } from '../types/domain.js';

export type LearningAction = 'accepted' | 'rejected' | 'modified';
export type LearningOutcome = 'successful' | 'failed' | 'unknown';
export type LearningSource =
  | 'user-suggestion'
  | 'self-healing'
  | 'manual-code-change'
  | 'governance-override'
  | 'code-review'
  | 'pull-request'
  | 'execution'
  | 'confidence-history';

export interface LearningEvent {
  id: string;
  source: LearningSource;
  action: LearningAction;
  recommendationType: string;
  originalRecommendation: string;
  finalOutcome?: string;
  executionResult?: LearningOutcome;
  confidenceScore?: number;
  patterns: string[];
  approved: boolean;
  merged?: boolean;
  experimental?: boolean;
  temporaryFailure?: boolean;
  createdAt: string;
}

export interface TeamAutomationProfile {
  generatedAt: string;
  preferredLocatorStrategy: string;
  preferredAssertionStyle: string;
  preferredPageObjectPattern: string;
  preferredAccessibilityRules: string;
  preferredWaitingStrategy: string;
  acceptedPatterns: PatternStat[];
  rejectedPatterns: PatternStat[];
  teamStandards: string[];
  governanceExceptions: string[];
  historicalOutcomes: {
    accepted: number;
    rejected: number;
    modified: number;
    successfulExecutions: number;
    failedExecutions: number;
  };
}

export interface PatternStat {
  pattern: string;
  count: number;
  acceptanceRate: number;
}

export interface LearningDashboard {
  profile: TeamAutomationProfile;
  mostAcceptedRecommendations: PatternStat[];
  mostRejectedRecommendations: PatternStat[];
  topTeamStandards: string[];
  confidenceAccuracyTrends: Array<{ bucket: string; acceptanceRate: number; count: number }>;
  selfHealingSuccessRate: number;
  frameworkEvolutionTrends: PatternStat[];
  tokenReductionTrends: Array<{ timestamp: string; reductionPercent: number }>;
  governanceComplianceTrends: Array<{ rule: string; acceptedOverrides: number; rejectedOverrides: number }>;
}

export interface AdaptiveConfidenceInput {
  baseScore: number;
  recommendationType: string;
  patterns: string[];
  governanceCompliant: boolean;
  executionSuccessful?: boolean;
  similarityScore?: number;
}

export class FrameworkLearningEngine {
  constructor(private readonly repositoryRoot: string) {}

  async recordEvent(event: Omit<LearningEvent, 'id' | 'createdAt'>): Promise<LearningEvent> {
    const normalized: LearningEvent = {
      ...event,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      createdAt: new Date().toISOString()
    };
    if (!isEligibleForLearning(normalized)) return normalized;
    const events = await this.readEvents();
    events.push(normalized);
    await this.writeEvents(events);
    await this.writeProfile(this.buildProfile(events));
    return normalized;
  }

  async readEvents(): Promise<LearningEvent[]> {
    try {
      return JSON.parse(await fs.readFile(this.eventsPath, 'utf8')) as LearningEvent[];
    } catch {
      return [];
    }
  }

  async getProfile(): Promise<TeamAutomationProfile> {
    const events = await this.readEvents();
    const profile = this.buildProfile(events);
    await this.writeProfile(profile);
    return profile;
  }

  async getDashboard(): Promise<LearningDashboard> {
    const events = await this.readEvents();
    const profile = this.buildProfile(events);
    return {
      profile,
      mostAcceptedRecommendations: profile.acceptedPatterns.slice(0, 8),
      mostRejectedRecommendations: profile.rejectedPatterns.slice(0, 8),
      topTeamStandards: profile.teamStandards.slice(0, 10),
      confidenceAccuracyTrends: confidenceBuckets(events),
      selfHealingSuccessRate: rate(
        events.filter((event) => event.source === 'self-healing' && event.executionResult === 'successful').length,
        events.filter((event) => event.source === 'self-healing').length
      ),
      frameworkEvolutionTrends: profile.acceptedPatterns.filter((item) =>
        /page-object|component|refactor|assertion|locator|accessibility/.test(item.pattern)
      ),
      tokenReductionTrends: await this.readTokenTrends(),
      governanceComplianceTrends: governanceTrends(events)
    };
  }

  async adaptiveInfluence(input: AdaptiveConfidenceInput): Promise<LearningInfluence> {
    const events = await this.readEvents();
    const accepted = events.filter((event) => event.action === 'accepted' || event.action === 'modified');
    const rejected = events.filter((event) => event.action === 'rejected');
    const historicalAcceptanceRate = averageAcceptance(input.patterns, accepted, rejected);
    const previousSuccessRate = successRate(input.patterns, events);
    const teamAlignment = teamPreferenceAlignment(input.patterns, this.buildProfile(events));
    const factors = [
      {
        name: 'Historical Acceptance Rate',
        adjustment: Math.round((historicalAcceptanceRate - 50) / 5),
        evidence: `${historicalAcceptanceRate}% acceptance for similar patterns`
      },
      {
        name: 'Governance Compliance',
        adjustment: input.governanceCompliant ? 5 : -12,
        evidence: input.governanceCompliant ? 'Current proposal passes governance' : 'Current proposal has governance findings'
      },
      {
        name: 'Previous Success Rate',
        adjustment: Math.round((previousSuccessRate - 50) / 8),
        evidence: `${previousSuccessRate}% successful outcomes after similar accepted changes`
      },
      {
        name: 'Team Preference Alignment',
        adjustment: Math.round(teamAlignment / 10),
        evidence: `${teamAlignment}% alignment with the current Team Automation Profile`
      },
      {
        name: 'Execution Success History',
        adjustment: input.executionSuccessful === undefined ? 0 : input.executionSuccessful ? 4 : -8,
        evidence:
          input.executionSuccessful === undefined
            ? 'No execution outcome attached to this recommendation'
            : input.executionSuccessful
              ? 'Latest execution succeeded'
              : 'Latest execution failed'
      }
    ];
    const adjustment = clamp(factors.reduce((total, factor) => total + factor.adjustment, 0), -25, 25);
    const finalScore = clamp(input.baseScore + adjustment, 0, 100);
    const profile = this.buildProfile(events);
    return {
      originalScore: input.baseScore,
      finalScore,
      adjustment,
      factors,
      standardsApplied: profile.teamStandards.slice(0, 6),
      historicalPatterns: input.patterns.filter((pattern) =>
        [...profile.acceptedPatterns, ...profile.rejectedPatterns].some((stat) => stat.pattern === pattern)
      )
    };
  }

  buildProfile(events: LearningEvent[]): TeamAutomationProfile {
    const accepted = patternStats(events, ['accepted', 'modified']);
    const rejected = patternStats(events, ['rejected']);
    return {
      generatedAt: new Date().toISOString(),
      preferredLocatorStrategy: topMatching(accepted, /^locator:/) ?? 'locator:getByRole',
      preferredAssertionStyle: topMatching(accepted, /^assertion:/) ?? 'assertion:expect(locator).toBeVisible',
      preferredPageObjectPattern: topMatching(accepted, /^page-object:/) ?? 'page-object:action-plus-verification-methods',
      preferredAccessibilityRules: topMatching(accepted, /^accessibility:/) ?? 'accessibility:wcag-2.1-aa',
      preferredWaitingStrategy: topMatching(accepted, /^wait:/) ?? 'wait:auto-waiting-and-web-first-assertions',
      acceptedPatterns: accepted,
      rejectedPatterns: rejected,
      teamStandards: accepted.filter((pattern) => pattern.acceptanceRate >= 70).map((pattern) => pattern.pattern),
      governanceExceptions: events
        .filter((event) => event.source === 'governance-override' && event.action !== 'rejected')
        .flatMap((event) => event.patterns),
      historicalOutcomes: {
        accepted: events.filter((event) => event.action === 'accepted').length,
        rejected: events.filter((event) => event.action === 'rejected').length,
        modified: events.filter((event) => event.action === 'modified').length,
        successfulExecutions: events.filter((event) => event.executionResult === 'successful').length,
        failedExecutions: events.filter((event) => event.executionResult === 'failed').length
      }
    };
  }

  private async writeEvents(events: LearningEvent[]): Promise<void> {
    await fs.mkdir(path.dirname(this.eventsPath), { recursive: true });
    await fs.writeFile(this.eventsPath, JSON.stringify(events, null, 2));
  }

  private async writeProfile(profile: TeamAutomationProfile): Promise<void> {
    await fs.mkdir(path.dirname(this.profilePath), { recursive: true });
    await fs.writeFile(this.profilePath, JSON.stringify(profile, null, 2));
  }

  private async readTokenTrends(): Promise<Array<{ timestamp: string; reductionPercent: number }>> {
    try {
      const index = JSON.parse(
        await fs.readFile(path.join(this.repositoryRoot, 'storage/indexes/framework-index.json'), 'utf8')
      ) as { generatedAt: string; tokenStats: { tokenReductionPercent: number } };
      return [{ timestamp: index.generatedAt, reductionPercent: index.tokenStats.tokenReductionPercent }];
    } catch {
      return [];
    }
  }

  private get eventsPath(): string {
    return path.join(this.repositoryRoot, 'storage/learning/events.json');
  }

  private get profilePath(): string {
    return path.join(this.repositoryRoot, 'storage/learning/team-profile.json');
  }
}

export function applyLearningInfluence(
  decision: ConfidenceDecision,
  influence: LearningInfluence
): ConfidenceDecision {
  const finalScore = influence.finalScore;
  return {
    ...decision,
    score: finalScore,
    band:
      finalScore >= 95
        ? 'auto'
        : finalScore >= 80
          ? 'approval'
          : finalScore < 60
            ? 'high-risk'
            : 'recommendation',
    reasoningSummary: `${decision.reasoningSummary} Team learning adjusted confidence by ${influence.adjustment} points.`,
    learningInfluence: influence
  };
}

function isEligibleForLearning(event: LearningEvent): boolean {
  if (!event.approved) return false;
  if (event.temporaryFailure || event.experimental) return false;
  if (event.executionResult === 'failed') return false;
  if (event.source === 'pull-request' && !event.merged) return false;
  return true;
}

function patternStats(events: LearningEvent[], actions: LearningAction[]): PatternStat[] {
  const counts = new Map<string, { total: number; accepted: number }>();
  for (const event of events) {
    for (const pattern of event.patterns) {
      const current = counts.get(pattern) ?? { total: 0, accepted: 0 };
      current.total += 1;
      if (actions.includes(event.action)) current.accepted += 1;
      counts.set(pattern, current);
    }
  }
  return [...counts.entries()]
    .map(([pattern, stat]) => ({
      pattern,
      count: stat.accepted,
      acceptanceRate: rate(stat.accepted, stat.total)
    }))
    .filter((stat) => stat.count > 0)
    .sort((a, b) => b.count - a.count || b.acceptanceRate - a.acceptanceRate);
}

function averageAcceptance(patterns: string[], accepted: LearningEvent[], rejected: LearningEvent[]): number {
  if (!patterns.length) return 50;
  const scores = patterns.map((pattern) => {
    const acceptedCount = accepted.filter((event) => event.patterns.includes(pattern)).length;
    const rejectedCount = rejected.filter((event) => event.patterns.includes(pattern)).length;
    return acceptedCount + rejectedCount === 0 ? 50 : rate(acceptedCount, acceptedCount + rejectedCount);
  });
  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function successRate(patterns: string[], events: LearningEvent[]): number {
  const matching = events.filter((event) => patterns.some((pattern) => event.patterns.includes(pattern)));
  if (!matching.length) return 50;
  return rate(matching.filter((event) => event.executionResult === 'successful').length, matching.length);
}

function teamPreferenceAlignment(patterns: string[], profile: TeamAutomationProfile): number {
  if (!patterns.length) return 0;
  const standards = new Set(profile.teamStandards);
  return rate(patterns.filter((pattern) => standards.has(pattern)).length, patterns.length);
}

function confidenceBuckets(events: LearningEvent[]): LearningDashboard['confidenceAccuracyTrends'] {
  const buckets = [
    { bucket: '0-59', min: 0, max: 59 },
    { bucket: '60-79', min: 60, max: 79 },
    { bucket: '80-94', min: 80, max: 94 },
    { bucket: '95-100', min: 95, max: 100 }
  ];
  return buckets.map((bucket) => {
    const matching = events.filter(
      (event) => (event.confidenceScore ?? -1) >= bucket.min && (event.confidenceScore ?? -1) <= bucket.max
    );
    return {
      bucket: bucket.bucket,
      acceptanceRate: rate(matching.filter((event) => event.action !== 'rejected').length, matching.length),
      count: matching.length
    };
  });
}

function governanceTrends(events: LearningEvent[]): LearningDashboard['governanceComplianceTrends'] {
  const overrides = events.filter((event) => event.source === 'governance-override');
  const rules = new Set(overrides.flatMap((event) => event.patterns));
  return [...rules].map((rule) => ({
    rule,
    acceptedOverrides: overrides.filter((event) => event.action !== 'rejected' && event.patterns.includes(rule)).length,
    rejectedOverrides: overrides.filter((event) => event.action === 'rejected' && event.patterns.includes(rule)).length
  }));
}

function topMatching(patterns: PatternStat[], matcher: RegExp): string | undefined {
  return patterns.find((pattern) => matcher.test(pattern.pattern))?.pattern;
}

function rate(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
