import { test } from '@playwright/test';
import { LoginPage } from '../../pages/LoginPage';

test('Login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.performWorkflow();
  await loginPage.verifyWorkflow();
});
