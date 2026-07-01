import { promises as fs } from 'node:fs';
import path from 'node:path';
import { expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export async function scanAccessibilityCheckpoint(
  page: Page,
  testInfo: TestInfo,
  checkpoint: string
): Promise<void> {
  if (process.env.RUN_ACCESSIBILITY_WITH_FUNCTIONAL !== 'true') return;

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  const report = {
    checkpoint,
    violationCount: results.violations.length,
    violations: results.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact ?? null,
      help: violation.help,
      helpUrl: violation.helpUrl,
      affectedTargets: violation.nodes.map((node) => node.target.join(' ')),
      suggestions: violation.nodes.map((node) => node.failureSummary).filter(Boolean)
    }))
  };

  await testInfo.attach(`accessibility-${slugify(checkpoint)}.json`, {
    body: JSON.stringify(report, null, 2),
    contentType: 'application/json'
  });
  await persistCheckpointReport(testInfo, checkpoint, report);

  expect(results.violations, accessibilityFailureMessage(report)).toEqual([]);
}

function accessibilityFailureMessage(report: {
  checkpoint: string;
  violations: Array<{
    id: string;
    impact: string | null;
    help: string;
    helpUrl: string;
    affectedTargets: string[];
    suggestions: Array<string | undefined>;
  }>;
}): string {
  const details = report.violations
    .map((violation) => {
      const targets = violation.affectedTargets.join(', ') || 'document';
      const suggestions = violation.suggestions.filter(Boolean).join(' ');
      return [
        `${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}`,
        `Targets: ${targets}`,
        suggestions ? `Suggestions: ${suggestions}` : `Reference: ${violation.helpUrl}`
      ].join('\n');
    })
    .join('\n\n');

  return `Accessibility violations at "${report.checkpoint}":\n\n${details}`;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'checkpoint';
}

async function persistCheckpointReport(testInfo: TestInfo, checkpoint: string, report: unknown): Promise<void> {
  const outputDir = path.join(process.cwd(), 'test-results', 'accessibility-checkpoints');
  const fileName = `${slugify(testInfo.title)}-${slugify(checkpoint)}.json`;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, fileName), JSON.stringify(report, null, 2));
}
