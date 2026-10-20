import { existsSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import anonymousConfig from './playwright.config';

const workspaceRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const generatedArtifacts = resolve(workspaceRoot, 'generated-artifacts');
const configuredState = process.env.CLOUDPAINTER_AUTH_STATE;

if (!configuredState) {
  throw new Error(
    'Signed-in browser checks require CLOUDPAINTER_AUTH_STATE pointing to an owner-approved disposable Clerk state under generated-artifacts/. No identity is created or substituted.',
  );
}

const authStatePath = resolve(workspaceRoot, configuredState);
if (!existsSync(generatedArtifacts)) {
  throw new Error('The ignored generated-artifacts/ directory must exist before using a signed-in state file.');
}
const realGeneratedArtifacts = realpathSync(generatedArtifacts);
const realAuthStatePath = existsSync(authStatePath) ? realpathSync(authStatePath) : authStatePath;
const authStateRelativePath = relative(realGeneratedArtifacts, realAuthStatePath);
if (
  isAbsolute(authStateRelativePath) ||
  authStateRelativePath === '..' ||
  authStateRelativePath.startsWith(`..${sep}`)
) {
  throw new Error('CLOUDPAINTER_AUTH_STATE must be stored under ignored generated-artifacts/.');
}
if (!existsSync(authStatePath) || !statSync(authStatePath).isFile()) {
  throw new Error('CLOUDPAINTER_AUTH_STATE does not exist. Signed-in checks were not started.');
}

export default defineConfig({
  ...anonymousConfig,
  projects: [{
    name: 'signed-in',
    grep: /signed-in generation/,
    use: {
      ...anonymousConfig.use,
      storageState: realAuthStatePath,
    },
  }],
});
