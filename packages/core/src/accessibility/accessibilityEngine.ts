export interface AccessibilityGuidance {
  standards: string[];
  checks: string[];
  remediation: string[];
}

export function accessibilityGuidance(): AccessibilityGuidance {
  return {
    standards: ['WCAG 2.1 A', 'WCAG 2.1 AA'],
    checks: [
      'Color contrast',
      'Keyboard accessibility',
      'ARIA compliance',
      'Semantic HTML',
      'Labels',
      'Focus management'
    ],
    remediation: [
      'Prefer semantic controls and accessible names before test ids',
      'Fix missing labels at the component layer',
      'Use visible focus styles for all keyboard-reachable controls'
    ]
  };
}
