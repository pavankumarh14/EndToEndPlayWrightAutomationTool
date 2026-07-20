import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  readonly fill1 = this.page.getByLabel('Email');
  readonly fill2 = this.page.getByLabel('Password');
  readonly click3 = this.page.getByRole('button', { name: 'Sign in' });

  async performWorkflow(): Promise<void> {
    await this.page.goto("https://example.com/login");
    await this.fill1.fill("user@example.com");
    await this.fill2.fill("secret");
    await this.click3.click();
  }

  async verifyWorkflow(): Promise<void> {
    await expect(this.page.getByText('Dashboard')).toBeVisible();
  }
}
