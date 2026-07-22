import { WorkflowModel } from '../types/domain.js';
import { ReusablePageObject } from '../reuse/pageObjectReuse.js';

export function generatePageObject(workflow: WorkflowModel, pageName = toPascal(workflow.name) + 'Page'): string {
  const businessMethod = toCamel(workflow.name);
  const verificationMethod = `verify${toPascal(workflow.name)}`;
  const locatedActions = workflow.actions.filter((action) => action.locator);
  const locators = [...new Map(locatedActions.map((action) => [action.locator!.raw, action.locator!])).values()];
  const locatorNames = new Map<string, string>();
  const usedLocatorNames = new Map<string, number>();
  locators.forEach((locator) => {
    const baseName = locatorPropertyName(locator.value);
    const occurrence = (usedLocatorNames.get(baseName) ?? 0) + 1;
    usedLocatorNames.set(baseName, occurrence);
    locatorNames.set(locator.raw, occurrence === 1 ? baseName : `${baseName}${occurrence}`);
  });
  const locatorLines = locators
    .map((locator) => {
      return `  readonly ${locatorNames.get(locator.raw)} = this.page.${locator.raw};`;
    })
    .join('\n');

  const navigationLines = workflow.navigation.map((url) => `    await this.page.goto(${JSON.stringify(url)});`);
  const actionLines = locatedActions.map(
    (action) =>
      `    await this.${locatorNames.get(action.locator!.raw)}.${action.kind}(${action.value ? JSON.stringify(action.value) : ''});`
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

export function generateAccessibilityTest(workflow: WorkflowModel, pageClassName?: string): string {
  const businessMethod = toCamel(workflow.name);
  const verificationMethod = `verify${toPascal(workflow.name)}`;
  const fixtureName = pageClassName
    ? pageClassName.charAt(0).toLowerCase() + pageClassName.slice(1)
    : undefined;
  const initialNavigation = workflow.navigation[0]
    ? `  await page.goto(${JSON.stringify(workflow.navigation[0])});\n  await expectAccessible(page, testInfo, 'initial-page');`
    : `  await expectAccessible(page, testInfo, 'initial-page');`;
  const interactionScan = pageClassName
    ? `
  const ${fixtureName} = new ${pageClassName}(page);
  await ${fixtureName}.${businessMethod}();
  await ${fixtureName}.${verificationMethod}();
  await expectAccessible(page, testInfo, 'after-recorded-workflow');`
    : '';
  return `import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
${pageClassName ? `import { ${pageClassName} } from '../../pages/${pageClassName}';\n` : ''}
test('${workflow.name} accessibility', async ({ page }, testInfo) => {
${initialNavigation}${interactionScan}
});

async function expectAccessible(page: Page, testInfo: TestInfo, scanName: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();

  await testInfo.attach(\`${'${scanName}'}-axe-results.json\`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json'
  });

  // Axe includes automated WCAG text color-contrast coverage. Non-text contrast,
  // gradients, canvas, and image-based controls need explicit product-specific checks.
  expect(results.violations, \`Axe violations in ${'${scanName}'}\`).toEqual([]);
}
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

function locatorPropertyName(value: string): string {
  const selectorValue = value
    .replace(/\[data-(?:test|testid)=['"]?([^'"\]]+)['"]?\]/i, '$1')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim();
  return toCamel(selectorValue) || 'recordedElement';
}
