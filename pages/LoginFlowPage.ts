import { expect, type Page } from '@playwright/test';

export class LoginFlowPage {
  constructor(private readonly page: Page) {}

  readonly username = this.page.locator('[data-test="username"]');
  readonly password = this.page.locator('[data-test="password"]');
  readonly loginButton = this.page.locator('[data-test="login-button"]');

  async loginFlow(): Promise<void> {
    await this.page.goto("https://www.saucedemo.com/");
    await this.username.click();
    await this.username.fill("standard_user");
    await this.password.click();
    await this.password.fill("secret_sauce");
    await this.loginButton.click();
  }

  async verifyLoginFlow(): Promise<void> {
    await expect(this.page.getByText('Swag Labs')).toBeVisible();
  }
}
