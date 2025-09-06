import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on',
    screenshot: 'on',
    video: 'on',
    viewport: { width: 1400, height: 800 },
    colorScheme: process.env.COLOR_SCHEME === 'dark' ? 'dark' : process.env.COLOR_SCHEME === 'light' ? 'light' : undefined,
    bypassCSP: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } },
    },
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
});
