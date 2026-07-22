import { defineConfig, devices } from '@playwright/test';

const configuredRetries = Number(process.env.PLAYWRIGHT_RETRIES);
const retries = Number.isInteger(configuredRetries) && configuredRetries >= 0
  ? configuredRetries
  : process.env.CI
    ? 0
    : 0;

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Set PLAYWRIGHT_RETRIES explicitly for a hosted run. This avoids retaining
  // empty video files from automatic retries when one clear failure is enough.
  retries,
  reporter: [['html'], ['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
