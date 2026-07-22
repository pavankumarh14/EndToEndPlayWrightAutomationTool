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
  findings: Array<{
    category: 'locator' | 'accessibility' | 'unknown';
    severity: 'critical' | 'serious' | 'moderate' | 'info';
    target?: string;
    recommendation: string;
    example?: string;
  }>;
  diff?: string;
  analysisSource: 'deterministic' | 'ai-assisted' | 'ai-fallback';
  nextAction: string;
  aiMessage?: string;
}

export class SelfHealingEngine {
  private readonly confidence = new ConfidenceEngine();

  propose(evidence: FailureEvidence): HealingProposal {
    const axe = extractAxeFailure(evidence.logs);
    const locatorFailure = /locator|strict mode|not found|timeout/i.test(evidence.logs);
    const locator = extractLocator(evidence.logs);
    const score = axe ? 92 : locatorFailure ? 82 : 55;
    if (axe) {
      const guidance = accessibilityGuidance(axe.rule);
      return {
        rootCause: `Axe found a ${axe.impact ?? 'serious'} ${axe.rule} violation${axe.target ? ` on ${axe.target}` : ''}.`,
        confidence: this.confidence.decide({
          subject: 'Accessibility repair proposal',
          deterministicScore: score,
          evidence: [axe.help, axe.target ?? ''],
          retrievedAssetsUsed: [evidence.tracePath, evidence.screenshotPath].filter(Boolean) as string[],
          similarityMetrics: { locatorFailure: 0, accessibilityViolation: 100 },
        }),
        proposedFix: guidance.recommendation,
        findings: [{
          category: 'accessibility',
          severity: axe.impact ?? 'serious',
          target: axe.target,
          recommendation: guidance.recommendation,
          example: guidance.example,
        }],
        analysisSource: 'deterministic',
        nextAction: 'Fix the application markup or styles (not the generated test), then run this accessibility test again.',
      };
    }
    return {
      rootCause: locatorFailure
        ? 'Failure appears locator-related based on Playwright logs and timeout language.'
        : 'Failure cause is ambiguous and requires manual review.',
      confidence: this.confidence.decide({
        subject: 'Self-healing proposal',
        deterministicScore: score,
        evidence: [evidence.logs.slice(0, 500)],
        retrievedAssetsUsed: [evidence.tracePath, evidence.screenshotPath].filter(
          Boolean,
        ) as string[],
        similarityMetrics: { locatorFailure: locatorFailure ? 100 : 0 },
      }),
      proposedFix: locatorFailure
        ? locator
          ? `The failing locator is ${locator}. Inspect the failure screenshot or trace, then prefer a stable getByRole, getByLabel, or getByTestId locator that matches the live element.`
          : 'Inspect the failure screenshot or trace, then prefer a stable getByRole, getByLabel, or getByTestId locator.'
        : 'Review the trace and run output before changing framework code.',
      findings: locatorFailure
        ? [{
            category: 'locator',
            severity: 'serious',
            target: locator,
            recommendation: 'Replace the failing locator only after confirming the live element in the trace or browser.',
            example: "await page.getByRole('button', { name: 'Save' }).click();",
          }]
        : [{
            category: 'unknown',
            severity: 'info',
            recommendation: 'Review the failure artifacts and run output before changing framework code.',
          }],
      analysisSource: 'deterministic',
      nextAction: locatorFailure
        ? 'Update the locator only after reviewing the target page, then run the selected test again.'
        : 'Review the failure artifacts. If a configured AI provider is available, the platform will request a limited root-cause review for this ambiguous failure.',
    };
  }
}

function extractAxeFailure(logs: string): { rule: string; impact?: 'critical' | 'serious' | 'moderate'; help: string; target?: string } | undefined {
  const rule = logs.match(/"id":\s*"([^"]+)"/)?.[1]
    ?? logs.match(/Axe violations?[^\n]*?['"]([a-z][\w-]+)['"]/)?.[1];
  if (!rule) return undefined;
  const impact = logs.match(/"impact":\s*"(critical|serious|moderate)"/)?.[1] as 'critical' | 'serious' | 'moderate' | undefined;
  const help = logs.match(/"help":\s*"([^"]+)"/)?.[1] ?? `Axe rule: ${rule}`;
  const target = logs.match(/"target":\s*Array \[\s*"([^"]+)"/)?.[1]
    ?? logs.match(/"html":\s*"(<[^>]+>)/)?.[1];
  return { rule, impact, help, target };
}

function extractLocator(logs: string): string | undefined {
  return logs.match(/waiting for\s+([^\n]+)/i)?.[1]?.trim()
    ?? logs.match(/(getBy(?:Role|Label|Text|TestId|Placeholder)\([^\n]+\))/)?.[1]
    ?? logs.match(/(locator\([^\n]+\))/)?.[1];
}

function accessibilityGuidance(rule: string): { recommendation: string; example?: string } {
  const fixes: Record<string, { recommendation: string; example?: string }> = {
    'select-name': {
      recommendation: 'Give the select an accessible name with a visible label, or aria-label/aria-labelledby when a visible label is not possible.',
      example: '<label htmlFor="product-sort">Sort products</label>\n<select id="product-sort" data-test="product-sort-container">…</select>',
    },
    'label': {
      recommendation: 'Associate every form input with a visible label, or provide an accurate aria-label for icon-only controls.',
      example: '<label htmlFor="email">Email</label>\n<input id="email" type="email" />',
    },
    'button-name': {
      recommendation: 'Give the button a visible text label or an accurate aria-label if it is icon-only.',
      example: '<button aria-label="Close dialog"><CloseIcon /></button>',
    },
    'color-contrast': {
      recommendation: 'Adjust the foreground and background colors to at least 4.5:1 for normal text, or 3:1 for large text. Re-run Axe to confirm the computed colors pass.',
    },
    'image-alt': {
      recommendation: 'Add useful alt text for informative images. Use alt="" only for purely decorative images.',
      example: '<img src="checkout.svg" alt="Checkout" />',
    },
  };
  return fixes[rule] ?? {
    recommendation: `Fix the ${rule} issue in the application markup or styles, then rerun the accessibility test.`,
  };
}
