import { ConfidenceEngine } from '../confidence/confidenceEngine.js';
import { ConfidenceDecision } from '../types/domain.js';

export interface FailureEvidence {
  logs: string;
  screenshotPath?: string;
  videoPath?: string;
  tracePath?: string;
  domSnapshot?: string;
}

export interface HealingProposal {
  rootCause: string;
  confidence: ConfidenceDecision;
  proposedFix: string;
  diff?: string;
}

export class SelfHealingEngine {
  private readonly confidence = new ConfidenceEngine();

  propose(evidence: FailureEvidence): HealingProposal {
    const locatorFailure = /locator|strict mode|not found|timeout/i.test(evidence.logs);
    const score = locatorFailure ? 82 : 55;
    return {
      rootCause: locatorFailure
        ? 'Failure appears locator-related based on Playwright logs and timeout language.'
        : 'Failure cause is ambiguous and requires manual review.',
      confidence: this.confidence.decide({
        subject: 'Self-healing proposal',
        deterministicScore: score,
        evidence: [evidence.logs.slice(0, 500)],
        retrievedAssetsUsed: [evidence.tracePath, evidence.screenshotPath].filter(Boolean) as string[],
        similarityMetrics: { locatorFailure: locatorFailure ? 100 : 0 }
      }),
      proposedFix: locatorFailure
        ? 'Run locator governance search, prefer role/label replacements, and submit diff for approval.'
        : 'Collect trace, DOM snapshot, and owner review before changing framework code.'
    };
  }
}
