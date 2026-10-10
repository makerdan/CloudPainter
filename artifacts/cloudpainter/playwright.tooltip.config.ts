import { defineConfig } from '@playwright/test';

const baseURL = process.env.CLOUDPAINTER_TEST_URL;
if (!baseURL) throw new Error('Set CLOUDPAINTER_TEST_URL to the existing authorized CloudPainter preview.');

export default defineConfig({
  testDir: './tests',
  testMatch: 'tooltips.spec.ts',
  timeout: 60_000,
  globalTimeout: 240_000,
  expect: { timeout: 3_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../../generated-artifacts/cloudpainter-tooltips',
  use: {
    baseURL,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH },
  },
});
