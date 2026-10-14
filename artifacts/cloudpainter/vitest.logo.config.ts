import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'jsdom',
    include: ['src/components/LogoCreationPanel.test.tsx', 'src/components/PoeUpscaleExport.test.tsx', 'src/components/SettingsPage.test.tsx', 'src/components/AdminNavigation.test.tsx', 'src/pages/AdminAccountsPage.test.tsx', 'src/components/CloudProjectBackups.test.tsx'],
    css: false,
  },
});
