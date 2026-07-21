import { test } from '@playwright/test';
import { CheckoutFlowPage } from '../../pages/CheckoutFlowPage';

test('CheckoutFlow', async ({ page }) => {
  const checkoutFlowPage = new CheckoutFlowPage(page);
  await checkoutFlowPage.checkoutFlow();
  await checkoutFlowPage.verifyCheckoutFlow();
});
