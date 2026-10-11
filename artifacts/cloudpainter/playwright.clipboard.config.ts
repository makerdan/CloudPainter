import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['LayerClipboard.test.tsx'],
  timeout: 60_000,
  globalTimeout: 240_000,
  outputDir: '../../generated-artifacts/cloudpainter-clipboard',
});
