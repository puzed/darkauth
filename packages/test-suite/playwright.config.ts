import { defineConfig, devices } from '@playwright/test';

const reporter = process.env.PW_REPORTER || 'dot';
const artifacts = process.env.PW_ARTIFACTS || 'off';
const outputDir = process.env.PW_OUTPUT_DIR || 'test-results';

const traceMode =
  artifacts === 'on'
    ? 'on'
    : artifacts === 'retain-on-failure'
      ? 'retain-on-failure'
      : 'off';
const screenshotMode =
  artifacts === 'on'
    ? 'on'
    : artifacts === 'retain-on-failure'
      ? 'only-on-failure'
      : 'off';
const videoMode =
  artifacts === 'on'
    ? 'on'
    : artifacts === 'retain-on-failure'
      ? 'retain-on-failure'
      : 'off';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter,
  use: {
    trace: traceMode,
    screenshot: screenshotMode,
    video: videoMode,
    viewport: { width: 1400, height: 800 },
    colorScheme: process.env.COLOR_SCHEME === 'dark' ? 'dark' : process.env.COLOR_SCHEME === 'light' ? 'light' : undefined,
  },
  outputDir,
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 800 } },
    },
  ],
  globalSetup: undefined,
  globalTeardown: undefined,
});
