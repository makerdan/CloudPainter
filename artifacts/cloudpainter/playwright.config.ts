import { defineConfig } from '@playwright/test';
import { execFileSync } from 'node:child_process';

// Anonymous browser checks run against an already-running preview and never
// inherit a Clerk session from the invoking environment.
const baseURL = process.env.CLOUDPAINTER_TEST_URL;
if (!baseURL) {
  throw new Error('Set CLOUDPAINTER_TEST_URL to the running CloudPainter preview URL.');
}

export default defineConfig({
  testDir: './src',
  testMatch: ['App.test.tsx', 'ImageGenerator.test.tsx', 'PanLimits.test.ts'],
  projects: [{
    name: 'anonymous',
    grepInvert: /signed-in generation/,
    use: { storageState: { cookies: [], origins: [] } },
  }],
  timeout: 30_000,
  globalTimeout: 240_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  workers: 4,
  retries: 0,
  reporter: 'list',
  outputDir: '../../generated-artifacts/cloudpainter-photo-card',
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
      args: ['--no-sandbox'],
    },
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
});
