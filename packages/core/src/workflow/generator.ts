import { WorkflowModel } from '../types/domain.js';
import { ReusablePageObject } from '../reuse/pageObjectReuse.js';

export function generatePageObject(workflow: WorkflowModel, pageName = toPascal(workflow.name) + 'Page'): string {
  const businessMethod = toCamel(workflow.name);
  const verificationMethod = `verify${toPascal(workflow.name)}`;
  const locatedActions = workflow.actions.filter((action) => action.locator);
  const locatorLines = locatedActions
    .map((action, index) => {
      const locator = action.locator!;
      return `  readonly ${action.kind}${index + 1} = this.page.${locator.raw};`;
    })
    .join('\n');

  const navigationLines = workflow.navigation.map((url) => `    await this.page.goto(${JSON.stringify(url)});`);
  const actionLines = locatedActions.map(
    (action, index) =>
      `    await this.${action.kind}${index + 1}.${action.kind}(${action.value ? JSON.stringify(action.value) : ''});`
  );

  return `import { expect, type Page } from '@playwright/test';

export class ${pageName} {
  constructor(private readonly page: Page) {}

${locatorLines || '  // Add accessible locators here after approval.'}

  async ${businessMethod}(): Promise<void> {
${[...navigationLines, ...actionLines].join('\n') || '    // No recorded actions were found.'}
  }

  async ${verificationMethod}(): Promise<void> {
${workflow.assertions.length ? workflow.assertions.map((assertion) => `    await expect(${toPageReference(assertion.target)}).${assertion.kind}(${assertion.expected});`).join('\n') : '    await expect(this.page).toHaveURL(/.*/);'}
  }
}
`;
}

export function generateFunctionalTest(workflow: WorkflowModel, pageClassName: string): string {
  const fixtureName = pageClassName.charAt(0).toLowerCase() + pageClassName.slice(1);
  const businessMethod = toCamel(workflow.name);
  const verificationMethod = `verify${toPascal(workflow.name)}`;
  return `import { test } from '@playwright/test';
import { ${pageClassName} } from '../../pages/${pageClassName}';

test('${workflow.name}', async ({ page }) => {
  const ${fixtureName} = new ${pageClassName}(page);
  await ${fixtureName}.${businessMethod}();
  await ${fixtureName}.${verificationMethod}();
});
`;
}

export function generateReusedFunctionalTest(workflow: WorkflowModel, reusable: ReusablePageObject): string {
  const className = reusable.pageObject.className!;
  const fixtureName = className.charAt(0).toLowerCase() + className.slice(1);
  const importPath = `../../${reusable.pageObject.filePath.replace(/\.tsx?$/, '')}`;
  return `import { test } from '@playwright/test';
import { ${className} } from '${importPath}';

test('${workflow.name}', async ({ page }) => {
  const ${fixtureName} = new ${className}(page);
  await ${fixtureName}.${reusable.businessMethod}();
  await ${fixtureName}.${reusable.verificationMethod}();
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

function toCamel(value: string): string {
  const pascal = toPascal(value);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toPageReference(target: string): string {
  return target.replace(/^page\./, 'this.page.');
}
