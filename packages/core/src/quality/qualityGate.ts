import { GovernanceReport } from '../types/domain.js';

export interface QualityGateResult {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; details: string }>;
}

export class QualityGate {
  evaluate(input: {
    governance: GovernanceReport;
    confidenceScore: number;
    hasFunctionalTest: boolean;
    hasAccessibilityTest: boolean;
  }): QualityGateResult {
    const checks = [
      { name: 'Governance Validation', passed: input.governance.passed, details: `${input.governance.violations.length} violations` },
      { name: 'Confidence Validation', passed: input.confidenceScore >= 80, details: `${input.confidenceScore}%` },
      { name: 'Functional Test Generated', passed: input.hasFunctionalTest, details: 'Business workflow test present' },
      { name: 'Accessibility Test Generated', passed: input.hasAccessibilityTest, details: 'WCAG 2.1 AA scan present' },
      { name: 'Architecture Compliance', passed: input.governance.passed, details: 'Folder, naming, locator, and reuse rules checked' }
    ];
    return { passed: checks.every((check) => check.passed), checks };
  }
}
