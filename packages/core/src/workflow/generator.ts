import { WorkflowModel } from '../types/domain.js';

export function generatePageObject(workflow: WorkflowModel, pageName = toPascal(workflow.name) + 'Page'): string {
  const locatorLines = workflow.actions
    .filter((action) => action.locator)
    .map((action, index) => {
      const locator = action.locator!;
      return `  readonly ${action.kind}${index + 1} = this.page.${locator.raw};`;
    })
    .join('\n');

  return `import { expect, type Locator, type Page } from '@playwright/test';

export class ${pageName} {
  constructor(private readonly page: Page) {}

${locatorLines || '  // Add accessible locators here after approval.'}

  async performWorkflow(): Promise<void> {
${workflow.actions.map((action, index) => `    await this.${action.kind}${index + 1}.${action.kind}(${action.value ? JSON.stringify(action.value) : ''});`).join('\n')}
  }

  async verifyWorkflow(): Promise<void> {
${workflow.assertions.length ? workflow.assertions.map((assertion) => `    await expect(${assertion.target}).${assertion.kind}(${assertion.expected});`).join('\n') : '    await expect(this.page).toHaveURL(/.*/);'}
  }
}
`;
}

export function generateFunctionalTest(workflow: WorkflowModel, pageClassName: string): string {
  const fixtureName = pageClassName.charAt(0).toLowerCase() + pageClassName.slice(1);
  return `import { test } from '@playwright/test';
import { ${pageClassName} } from '../../pages/${pageClassName}';

test('${workflow.name}', async ({ page }) => {
  const ${fixtureName} = new ${pageClassName}(page);
  await ${fixtureName}.performWorkflow();
  await ${fixtureName}.verifyWorkflow();
});
`;
}

export function generateAccessibilityTest(workflow: WorkflowModel): string {
  return `import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('${workflow.name} accessibility', async ({ page }) => {
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
`;
}

function toPascal(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9]+/g, ' ');
  const pascal = normalized
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  return pascal || 'Generated';
}
