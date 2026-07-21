import { expect, type Page } from '@playwright/test';

export class LoginFlowPage {
  constructor(private readonly page: Page) {}

  // Add accessible locators here after approval.

  async loginFlow(): Promise<void> {
    await this.page.goto("https://www.saucedemo.com/");
  }

  async verifyLoginFlow(): Promise<void> {
    await expect(this.page.getByText('Swag Labs')).toBeVisible();
  }
}
