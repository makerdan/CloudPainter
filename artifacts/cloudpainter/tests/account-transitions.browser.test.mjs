import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const url = process.env.CLOUDPAINTER_TEST_URL;
if (!url || !/^https?:\/\//.test(url)) throw new Error('Set CLOUDPAINTER_TEST_URL to the running preview.');

const STORE_KEY = 'cloudpainter-project-v1';
const stroke = (color, y) => ({
  points: [{ x: 0.2, y }, { x: 0.7, y }],
  color,
  size: 8,
  tool: 'pen',
});
const project = {
  image: null,
  width: 320,
  height: 240,
  title: 'Account transition sketch',
  selectedLayerId: 'history-bottom',
  photoZoom: 1,
  photoPan: { x: 0, y: 0 },
  referencePhotoVisible: true,
  referencePhotoOpacity: 100,
  layers: [
    {
      id: 'history-bottom',
      name: 'Background',
      visible: true,
      opacity: 0.65,
      strokes: [stroke('#e53935', 0.2)],
      redo: [stroke('#ff9800', 0.25)],
    },
    {
      id: 'history-main',
      name: 'Main drawing',
      visible: true,
      opacity: 0.9,
      strokes: [stroke('#1e88e5', 0.4), stroke('#8e24aa', 0.45)],
      redo: [stroke('#00acc1', 0.5), stroke('#d81b60', 0.55)],
    },
  ],
};

function launchBrowser() {
  return chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
}

async function installClerkFixture(page, isSignedIn) {
  await page.addInitScript(({ signedIn }) => {
    window.__cloudPainterAccountFixture = {
      moduleLoaded: false,
      signOutCalls: [],
      auth: {
        isLoaded: true,
        isSignedIn: signedIn,
        userId: signedIn ? 'fixture-user' : null,
        sessionId: signedIn ? 'fixture-session' : null,
      },
      rejectSignOut: false,
    };
  }, { signedIn: isSignedIn });

  // Replace Clerk's browser package at its Vite-optimized module boundary. The
  // production AccountControls remains real; only session data and signOut are
  // controlled by this fixture.
  await page.route(/\/node_modules\/\.vite\/deps\/@clerk_react(?:_internal)?\.js(?:\?.*)?$/, async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('_internal')) {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `window.__cloudPainterAccountFixture.moduleLoaded = true;
          export const publishableKeyFromHost = () => 'pk_test_fixture';`,
      });
      return;
    }
    await route.fulfill({
      contentType: 'application/javascript',
      body: `window.__cloudPainterAccountFixture.moduleLoaded = true;
        export const ClerkProvider = ({ children }) => children;
        export const SignIn = () => null;
        export const SignUp = () => null;
        export const useAuth = () => window.__cloudPainterAccountFixture.auth;
        export const useUser = () => ({ user: { firstName: 'Fixture user' } });
        export const useClerk = () => ({
          signOut: async options => {
            window.__cloudPainterAccountFixture.signOutCalls.push(options);
            if (window.__cloudPainterAccountFixture.rejectSignOut) throw new Error('fixture sign-out rejection');
          },
        });`,
    });
  });
  await page.route(/\/node_modules\/\.vite\/deps\/@clerk_themes\.js(?:\?.*)?$/, route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export const shadcn = {};',
  }));
}

async function seedProject(page) {
  await page.addInitScript(({ key, value }) => {
    const marker = `${key}-account-transition-test-seeded`;
    if (sessionStorage.getItem(marker)) return;
    localStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem(marker, 'true');
  }, { key: STORE_KEY, value: project });
}

async function storedProject(page) {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? 'null'), STORE_KEY);
}

async function drawStroke(page) {
  const canvas = page.locator('canvas.draw-surface');
  await canvas.waitFor();
  const strokesBefore = await page.evaluate(key =>
    JSON.parse(localStorage.getItem(key) ?? 'null').layers.reduce((count, layer) => count + layer.strokes.length, 0),
  STORE_KEY);
  const bounds = await canvas.boundingBox();
  assert.ok(bounds);
  await page.mouse.move(bounds.x + bounds.width * 0.25, bounds.y + bounds.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.72, bounds.y + bounds.height * 0.62, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(({ key, count }) =>
    JSON.parse(localStorage.getItem(key) ?? 'null').layers.reduce((total, layer) => total + layer.strokes.length, 0) > count,
  { key: STORE_KEY, count: strokesBefore });
}

test('a rejected sign-out reports the error and keeps the drawn sketch recoverable', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await installClerkFixture(page, true);
    await page.addInitScript(() => {
      window.__cloudPainterAccountFixture.rejectSignOut = true;
    });
    await page.route('**/api/admin/overview*', route => route.fulfill({
      status: 404,
      json: { error: 'Not found' },
    }));
    await page.route('**/api/settings*', route => route.fulfill({
      status: 401,
      json: { error: 'Fixture account session is not a real session.' },
    }));
    await page.route('**/api/palette*', route => route.fulfill({
      status: 401,
      json: { error: 'Fixture account session is not a real session.' },
    }));
    await seedProject(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__cloudPainterAccountFixture.moduleLoaded);
    await page.getByTestId('button-undo').waitFor();
    await page.getByTestId('status-save').getByText('Saved in this browser').waitFor();
    await drawStroke(page);

    const savedBeforeSignOut = await storedProject(page);
    assert.ok(savedBeforeSignOut.layers.some(layer => layer.strokes.length > 1), 'fixture drawing is persisted locally');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('alert').getByText('Sign-out failed. Please retry.', { exact: true }).waitFor();

    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    await signOut.waitFor();
    assert.equal(await signOut.isEnabled(), true, 'the account controls recover for retry');
    assert.equal(await page.getByTestId('account-name').innerText(), 'Fixture user');
    assert.equal(await page.getByTestId('button-undo').isEnabled(), true);
    assert.deepEqual(await storedProject(page), savedBeforeSignOut, 'failed sign-out does not change browser-local artwork');
    assert.equal(await page.evaluate(() => window.__cloudPainterAccountFixture.signOutCalls.length), 1);

    await page.reload();
    await page.getByTestId('button-undo').waitFor();
    assert.deepEqual(await storedProject(page), savedBeforeSignOut, 'the sketch remains recoverable after reload');
    assert.equal(await page.getByTestId('button-undo').isEnabled(), true);
    await context.close();
  } finally {
    await browser.close();
  }
});

test('account-page navigation flushes pending layer-history edits without sharing account state', { timeout: 60_000 }, async () => {
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await installClerkFixture(page, false);
    await seedProject(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__cloudPainterAccountFixture.moduleLoaded);
    await page.getByTestId('button-undo').waitFor();
    await page.waitForFunction(key => localStorage.getItem(key) !== null, STORE_KEY);
    await page.getByText('Saved in this browser', { exact: true }).waitFor();
    assert.deepEqual(await storedProject(page), project, 'the starting sketch is settled before edits');
    await page.clock.pauseAt(new Date());

    await page.getByTestId('button-select-layer-history-main').click();
    await page.getByTestId('button-undo').click();
    const expected = {
      ...project,
      selectedLayerId: 'history-main',
      layers: project.layers.map(layer => layer.id === 'history-main'
        ? { ...layer, strokes: layer.strokes.slice(0, -1), redo: [...layer.redo, layer.strokes.at(-1)] }
        : layer),
    };
    assert.deepEqual(await storedProject(page), project, 'the debounce is still pending before account navigation');

    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page.getByText(/Palettes and personal preferences are saved to your account/i).waitFor();
    assert.deepEqual(await storedProject(page), expected, 'leaving the editor flushes the latest local history');
    assert.equal(await page.evaluate(() => window.__cloudPainterAccountFixture.auth.userId), null);

    await page.getByRole('link', { name: 'Back to your drawing', exact: true }).click();
    await page.getByTestId('button-undo').waitFor();
    assert.deepEqual(await storedProject(page), expected, 'returning to the editor restores the complete edited project');
    assert.equal(await page.getByTestId('layer-row-history-main').evaluate(element => element.classList.contains('active')), true);
    assert.equal(await page.getByTestId('button-undo').isEnabled(), true);
    assert.equal(await page.getByTestId('button-redo').isEnabled(), true);

    await page.reload();
    await page.getByTestId('button-undo').waitFor();
    assert.deepEqual(await storedProject(page), expected, 'reload also restores both independent layer histories');
    assert.equal(await page.getByTestId('layer-row-history-main').evaluate(element => element.classList.contains('active')), true);
    await context.close();
  } finally {
    await browser.close();
  }
});
