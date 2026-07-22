import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { LoginFlowPage } from '../../pages/LoginFlowPage';

test('LoginFlow accessibility', async ({ page }, testInfo) => {
  await page.goto("https://www.saucedemo.com/");
  await expectAccessible(page, testInfo, 'initial-page');
  const loginFlowPage = new LoginFlowPage(page);
  await loginFlowPage.loginFlow();
  await loginFlowPage.verifyLoginFlow();
  await expectAccessible(page, testInfo, 'after-recorded-workflow');
});

async function expectAccessible(page: Page, testInfo: TestInfo, scanName: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'])
    .analyze();

  await testInfo.attach(`${scanName}-axe-results.json`, {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json'
  });

  // Axe includes automated WCAG text color-contrast coverage. Non-text contrast,
  // gradients, canvas, and image-based controls need explicit product-specific checks.
  expect(results.violations, `Axe violations in ${scanName}`).toEqual([]);
}
