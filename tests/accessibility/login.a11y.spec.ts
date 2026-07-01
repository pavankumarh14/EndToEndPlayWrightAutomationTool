import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('Login accessibility', async ({ page }) => {
  await page.setContent(`
    <!doctype html>
    <html lang="en">
      <head>
        <title>Login accessibility smoke</title>
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
        </main>
      </body>
    </html>
  `);
  const accessibilityScanResults = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
