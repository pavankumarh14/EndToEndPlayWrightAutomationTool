import { ConfidenceDecision } from '../types/domain.js';

export class ConfidenceEngine {
  decide(input: {
    subject: string;
    deterministicScore: number;
    semanticScore?: number;
    evidence: string[];
    retrievedAssetsUsed: string[];
    similarityMetrics: Record<string, number>;
  }): ConfidenceDecision {
    const semantic = input.semanticScore ?? input.deterministicScore;
    const score = Math.max(
      0,
      Math.min(100, Math.round(input.deterministicScore * 0.7 + semantic * 0.3))
    );

    return {
      subject: input.subject,
      score,
      band:
        score >= 95
          ? 'auto'
          : score >= 80
            ? 'approval'
            : score < 60
              ? 'high-risk'
              : 'recommendation',
      reasoningSummary: summarize(score, input.subject),
      supportingEvidence: input.evidence,
      retrievedAssetsUsed: input.retrievedAssetsUsed,
      similarityMetrics: input.similarityMetrics
    };
  }
}

function summarize(score: number, subject: string): string {
  if (score >= 95) return `${subject} is safe for automatic application under enterprise guardrails.`;
  if (score >= 80) return `${subject} is plausible but requires human approval before modification.`;
  if (score >= 60) return `${subject} is a recommendation only; no framework mutation is allowed.`;
  return `${subject} is high risk and must be manually reviewed.`;
}
