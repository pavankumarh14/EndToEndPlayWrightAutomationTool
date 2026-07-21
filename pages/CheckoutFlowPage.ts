import { expect, type Page } from '@playwright/test';

export class CheckoutFlowPage {
  constructor(private readonly page: Page) {}

  // Add accessible locators here after approval.

  async checkoutFlow(): Promise<void> {
    await this.page.goto("https://www.saucedemo.com/");
  }

  async verifyCheckoutFlow(): Promise<void> {
    await expect(this.page.getByText('Swag Labs')).toBeVisible();
  }
}
