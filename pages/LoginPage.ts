import { expect, type Page } from '@playwright/test';

export class LoginPage {
  constructor(private readonly page: Page) {}

  get email() {
    return this.page.getByLabel('Email');
  }

  get password() {
    return this.page.getByLabel('Password');
  }

  get signIn() {
    return this.page.getByRole('button', { name: 'Sign in' });
  }

  get dashboard() {
    return this.page.getByRole('status', { name: 'Dashboard' });
  }

  async load(): Promise<void> {
    await this.page.setContent(`
      <!doctype html>
      <html lang="en">
        <head>
          <title>Login smoke</title>
        </head>
        <body>
          <main>
            <form aria-label="Login form">
              <label>
                Email
                <input name="email" type="email" />
              </label>
              <label>
                Password
                <input name="password" type="password" />
              </label>
              <button type="button">Sign in</button>
            </form>
            <div role="status" aria-label="Dashboard" hidden>Dashboard</div>
          </main>
          <script>
            document.querySelector('button').addEventListener('click', () => {
              document.querySelector('[role="status"]').hidden = false;
            });
          </script>
        </body>
      </html>
    `);
  }

  async signInAs(email: string, password: string): Promise<void> {
    await this.email.fill(email);
    await this.password.fill(password);
    await this.signIn.click();
  }

  async performWorkflow(): Promise<void> {
    await this.load();
    await this.email.fill('user@example.com');
    await this.password.fill('secret');
    await this.signIn.click();
  }

  async verifyWorkflow(): Promise<void> {
    await expect(this.dashboard).toBeVisible();
  }
}
