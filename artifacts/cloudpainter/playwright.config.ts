import { defineConfig } from '@playwright/test';

// Run against an already-running CloudPainter preview; do not launch a second server.
const baseURL = process.env.CLOUDPAINTER_TEST_URL;
if (!baseURL) {
  throw new Error('Set CLOUDPAINTER_TEST_URL to the running CloudPainter preview URL.');
}

export default defineConfig({
  testDir: './src',
  testMatch: 'App.test.tsx',
  timeout: 30_000,
  globalTimeout: 240_000,
  expect: { timeout: 5_000 },
  workers: 1,
  retries: 0,
  reporter: 'list',
  outputDir: '../../generated-artifacts/cloudpainter-photo-card',
  use: {
    baseURL,
    browserName: 'chromium',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
