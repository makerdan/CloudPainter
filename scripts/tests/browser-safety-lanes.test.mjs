import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertNoProviderRequestsEscaped,
  createProviderRequestGuard,
  isProviderCapableApiRequest,
} from '../../artifacts/cloudpainter/tests/provider-request-guard.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('an unmocked provider-capable route is locally aborted and fails the check', async () => {
  const attempts = [];
  const actions = [];
  const handler = createProviderRequestGuard(attempts);
  await handler({
    request: () => ({ url: () => 'http://127.0.0.1:4173/api/images/generate?prompt=private' }),
    abort: async (reason) => actions.push(['abort', reason]),
    continue: async () => actions.push(['continue']),
    fulfill: async () => actions.push(['fulfill']),
  });

  assert.deepEqual(attempts, ['/api/images/generate']);
  assert.deepEqual(actions, [['abort', 'blockedbyclient']]);
  assert.throws(
    () => assertNoProviderRequestsEscaped(attempts),
    /had no local fixture; blocked before dispatch/,
  );
});

test('the guard covers every current provider-capable API route family', () => {
  for (const path of [
    '/api/images/config',
    '/api/images/generate',
    '/api/images/upscale',
    '/api/outlines/config',
    '/api/outlines',
    '/api/logo-images',
  ]) {
    assert.equal(isProviderCapableApiRequest(`http://localhost${path}`), true, path);
  }

  for (const path of ['/api/healthz', '/api/palette', '/api/settings']) {
    assert.equal(isProviderCapableApiRequest(`http://localhost${path}`), false, path);
  }
});

test('anonymous and signed-in Playwright configs are isolated and explicitly selected', async () => {
  const anonymousConfig = await read('../../artifacts/cloudpainter/playwright.config.ts');
  const signedInConfig = await read('../../artifacts/cloudpainter/playwright.signed-in.config.ts');
  const packageJson = JSON.parse(await read('../../artifacts/cloudpainter/package.json'));
  const workflow = await read('../../.github/workflows/cloudpainter-ci.yml');

  assert.match(anonymousConfig, /name:\s*'anonymous'/);
  assert.match(anonymousConfig, /grepInvert:\s*\/signed-in generation\//);
  assert.match(anonymousConfig, /storageState:\s*\{\s*cookies:\s*\[\],\s*origins:\s*\[\]\s*\}/);
  assert.match(signedInConfig, /name:\s*'signed-in'/);
  assert.match(signedInConfig, /grep:\s*\/signed-in generation\//);
  assert.match(signedInConfig, /if \(!configuredState\)/);
  assert.match(signedInConfig, /owner-approved disposable Clerk state/);
  assert.match(signedInConfig, /under ignored generated-artifacts/);
  assert.equal(packageJson.scripts['test:anonymous-photo-and-images'], 'playwright test --config playwright.config.ts');
  assert.equal(packageJson.scripts['test:poe-images'], 'playwright test --config playwright.signed-in.config.ts ImageGenerator.test.tsx');
  assert.match(workflow, /env -u CLOUDPAINTER_AUTH_STATE .*test:anonymous-photo-and-images/);
});

test('all targeted browser files use the fail-closed fixture, including multi-tab contexts', async () => {
  for (const path of [
    '../../artifacts/cloudpainter/src/App.test.tsx',
    '../../artifacts/cloudpainter/src/ImageGenerator.test.tsx',
    '../../artifacts/cloudpainter/src/PanLimits.test.ts',
  ]) {
    const source = await read(path);
    assert.match(source, /from ['"]\.\.\/tests\/browser-safety-fixtures['"]/);
  }

  const appTests = await read('../../artifacts/cloudpainter/src/App.test.tsx');
  assert.match(appTests, /const assertNoProviderRequests = await installProviderRequestGuard\(context\)/);
});

test('the guard is installed before local stubs so test fixtures take precedence', async () => {
  const fixtures = await read('../../artifacts/cloudpainter/tests/browser-safety-fixtures.ts');
  const appTests = await read('../../artifacts/cloudpainter/src/App.test.tsx');
  assert.match(fixtures, /await page\.route\([\s\S]*createProviderRequestGuard\(unexpectedRequests\)/);
  assert.match(fixtures, /assertNoProviderRequestsEscaped\(unexpectedRequests\)/);
  assert.match(appTests, /installProviderRequestGuard\(context\);[\s\S]*context\.route\('\*\*\/api\/images\/config'/);
});

test('production authorization has no browser-test identity bypass', async () => {
  const accountProvider = await read('../../artifacts/cloudpainter/src/components/Account.tsx');
  assert.doesNotMatch(accountProvider, /CLOUDPAINTER_AUTH_STATE|TEST_AUTH|testIdentity|bypassAuth/i);
});
