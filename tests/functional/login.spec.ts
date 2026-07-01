import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';
import { scanAccessibilityCheckpoint } from '../../utils/accessibilityScan';

test('Login', async ({ page }, testInfo) => {
  const loginPage = new LoginPage(page);
  await loginPage.load();
  await scanAccessibilityCheckpoint(page, testInfo, 'login page loaded');
  await loginPage.signInAs('user@example.com', 'secret');
  await scanAccessibilityCheckpoint(page, testInfo, 'after sign in click');
  await loginPage.verifyWorkflow();
});
