import { test } from '@playwright/test';
import { LoginFlowPage } from '../../pages/LoginFlowPage';

test('LoginFlow', async ({ page }) => {
  const loginFlowPage = new LoginFlowPage(page);
  await loginFlowPage.loginFlow();
  await loginFlowPage.verifyLoginFlow();
});
