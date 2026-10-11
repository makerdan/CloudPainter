import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  testMatch: ['DrawingTools.test.tsx', 'BrushStyles.test.tsx'],
  timeout: 60_000,
  globalTimeout: 240_000,
  outputDir: '../../generated-artifacts/cloudpainter-instruments',
});
