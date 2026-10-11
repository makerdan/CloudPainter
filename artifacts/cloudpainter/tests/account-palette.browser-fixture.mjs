import assert from 'node:assert/strict';

/** Exercise the real palette component with isolated account/transport fixtures.
 * This does not authenticate, contact a live palette API, or prove backend ownership.
 */
export async function checkPaletteDisclosure(browser, url) {
  const context = await browser.newContext({ viewport: { width: 360, height: 1100 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    await page.route('**/src/components/Account.tsx*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export const AccountProvider = ({children}) => children;
        export const AccountControls = () => null;
        export const SignInPage = () => null;
        export const SignUpPage = () => null;
        export const usePaletteAccount = () => ({isLoaded:true,userId:'fixture-user',sessionId:'fixture-session'});`,
    }));
    let palette = { revision: 0, colors: [{ id: 'pine', name: 'Pine', hex: '#315d4d' }] };
    let loads = 0;
    let writes = 0;
    let failSave = true;
    let releaseLoad;
    const loading = new Promise(resolve => { releaseLoad = resolve; });
    await page.route('**/api/palette', async route => {
      assert.equal(route.request().headers()['x-palette-session'], 'fixture-session');
      if (route.request().method() === 'GET') {
        loads++;
        await loading;
      } else {
        writes++;
        if (failSave) {
          failSave = false;
          await route.fulfill({ status: 503, json: { error: 'Fixture outage' } });
          return;
        }
        const request = route.request().postDataJSON();
        assert.deepEqual(Object.keys(request).sort(), ['colors', 'revision']);
        palette = { ...request, revision: request.revision + 1 };
      }
      await route.fulfill({ json: palette });
    });
    await page.goto(url);
    const header = page.getByTestId('disclosure-color');
    await page.getByText('Loading palette…', { exact: true }).waitFor();
    await header.click();
    releaseLoad();
    await header.click();
    await page.getByRole('button', { name: 'Use Pine (#315D4D)', exact: true }).waitFor();
    assert.equal(loads, 1, 'Hiding does not reload account state');
    const name = page.getByLabel('Name the current color');
    await name.fill('Draft color');
    await header.click();
    await header.click();
    assert.equal(await name.inputValue(), 'Draft color');
    await page.getByRole('button', { name: 'Save color', exact: true }).click();
    await page.getByRole('alert').waitFor();
    await header.click();
    await header.click();
    assert.match(await page.getByRole('alert').innerText(), /Palette save failed/);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.getByRole('button', { name: 'Use Draft color (#315D4D)', exact: true }).waitFor();
    assert.equal(writes, 2);
    await page.getByTestId('button-tool-eraser').click();
    await page.getByRole('button', { name: 'Use Pine (#315D4D)', exact: true }).click();
    assert.match(await page.getByTestId('button-tool-brush').getAttribute('class'), /selected/);
    await page.getByRole('button', { name: 'Rename Pine', exact: true }).click();
    await page.getByLabel('Rename saved color').fill('Evergreen');
    await header.click();
    await header.click();
    assert.equal(await page.getByLabel('Rename saved color').inputValue(), 'Evergreen');
    await page.getByRole('button', { name: 'Save name', exact: true }).click();
    await page.getByRole('button', { name: 'Use Evergreen (#315D4D)', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Remove Evergreen', exact: true }).click();
    await page.getByRole('button', { name: 'Remove Evergreen', exact: true }).waitFor({ state: 'detached' });
    assert.equal(palette.colors.length, 1);
    assert.equal(await page.locator('.personal-palette').evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return [...element.querySelectorAll('button,input')].every(control => {
        const rect = control.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right;
      });
    }), true, 'Saved-palette actions fit at 360px');
  } finally {
    await context.close();
  }
}

/** Verify that identity changes while Color is collapsed discard private UI and late replies. */
export async function checkPaletteAccountTransition(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 1000 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    // Let mocked requests finish after the component aborts them. This exercises the
    // generation/disposal guard rather than relying on transport cancellation alone.
    await page.addInitScript(() => {
      const nativeFetch = window.fetch.bind(window);
      // A Request input carries its original AbortSignal; use a fresh never-aborted
      // signal so disposal cannot cancel the held response before the fixture releases it.
      window.fetch = (input, init = {}) => nativeFetch(input, { ...init, signal: new AbortController().signal });
      window.__paletteFixtureAccount = { userId: 'account-a', sessionId: 'session-a' };
    });
    await page.route('**/src/components/Account.tsx*', route => route.fulfill({
      contentType: 'application/javascript',
      body: `export const AccountProvider = ({children}) => children;
        export const AccountControls = () => null;
        export const SignInPage = () => null;
        export const SignUpPage = () => null;
        export const usePaletteAccount = () => ({isLoaded:true,...window.__paletteFixtureAccount});`,
    }));

    let currentSession = 'session-a';
    const requests = [];
    const blocked = new Map();
    const completed = new Map();
    const completionWaiters = new Map();
    const palettes = {
      'session-b': { revision: 2, colors: [{ id: 'beta-secret', name: 'Beta private', hex: '#315d4d' }] },
      'session-c': { revision: 3, colors: [{ id: 'cobalt', name: 'Cobalt', hex: '#2457c5' }] },
      'session-d': { revision: 4, colors: [{ id: 'dawn', name: 'Dawn', hex: '#e5a25b' }] },
    };
    const gate = key => {
      let release;
      const promise = new Promise(resolve => { release = resolve; });
      blocked.set(key, { promise, release });
    };
    const complete = key => {
      const count = (completed.get(key) ?? 0) + 1;
      completed.set(key, count);
      const waiting = completionWaiters.get(key) ?? [];
      completionWaiters.set(key, waiting.filter(waiter => {
        if (count >= waiter.expected) {
          waiter.resolve();
          return false;
        }
        return true;
      }));
    };
    const waitForCompletion = (key, expected = 1) => {
      if ((completed.get(key) ?? 0) >= expected) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for mocked ${key} response`)), 10_000);
        const waiting = completionWaiters.get(key) ?? [];
        waiting.push({
          expected,
          resolve: () => { clearTimeout(timer); resolve(); },
        });
        completionWaiters.set(key, waiting);
      });
    };
    gate('GET:session-a');
    gate('PUT:session-b');
    await page.route('**/api/palette', async route => {
      const request = route.request();
      const method = request.method();
      const session = request.headers()['x-palette-session'];
      assert.ok(session, 'palette request includes the session header');
      assert.equal(session, currentSession, 'requests after an identity change use only its session');
      const key = `${method}:${session}`;
      requests.push({ method, session });
      if (method === 'GET' && session === 'session-a') {
        await blocked.get(key).promise;
        await route.fulfill({ json: { revision: 1, colors: [{ id: 'alpha-secret', name: 'Alpha private', hex: '#873a70' }] } });
      } else if (method === 'PUT' && session === 'session-b') {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), ['colors', 'revision']);
        await blocked.get(key).promise;
        await route.fulfill({ json: { ...body, revision: body.revision + 1 } });
      } else if (method === 'PUT') {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body).sort(), ['colors', 'revision']);
        palettes[session] = { ...body, revision: body.revision + 1 };
        await route.fulfill({ json: palettes[session] });
      } else {
        await route.fulfill({ json: palettes[session] ?? { revision: 0, colors: [] } });
      }
      complete(key);
    });

    await page.goto(url);
    const colorDisclosure = page.getByTestId('disclosure-color');
    await page.getByText('Loading palette…', { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const project = JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}');
      return Array.isArray(project.layers);
    });

    const canvas = page.locator('canvas.draw-surface');
    await canvas.scrollIntoViewIfNeeded();
    const bounds = await canvas.boundingBox();
    assert.ok(bounds);
    const center = { x: bounds.x + bounds.width * 0.48, y: bounds.y + bounds.height * 0.5 };
    await page.mouse.move(center.x - 40, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x + 40, center.y, { steps: 4 });
    await page.mouse.up();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('cloudpainter-project-v1') || '{}').layers?.some(layer => layer.strokes?.length));
    const drawingBefore = await page.evaluate(() => ({
      project: localStorage.getItem('cloudpainter-project-v1'),
      pixel: (() => {
        const canvas = document.querySelector('canvas.draw-surface');
        return [...canvas.getContext('2d').getImageData(Math.floor(canvas.width * 0.48), Math.floor(canvas.height * 0.5), 1, 1).data];
      })(),
    }));
    let nextTool = 'eraser';
    const changeSession = async (userId, sessionId) => {
      currentSession = sessionId;
      await page.evaluate(({ userId, sessionId }) => {
        window.__paletteFixtureAccount = { userId, sessionId };
      }, { userId, sessionId });
      await page.getByTestId(`button-tool-${nextTool}`).click();
      nextTool = nextTool === 'eraser' ? 'pen' : 'eraser';
    };

    // The first account's load is unresolved when Color is collapsed and the
    // session changes. Its reply arrives only after the second account is active.
    await colorDisclosure.click();
    assert.equal(await colorDisclosure.getAttribute('aria-expanded'), 'false');
    await changeSession('account-b', 'session-b');
    await page.getByText('Beta private', { exact: true }).waitFor({ state: 'attached' });
    blocked.get('GET:session-a').release();
    await waitForCompletion('GET:session-a', 1);

    // Start a save under session B, then replace B with C while Color is hidden.
    await colorDisclosure.click();
    await page.getByLabel('Name the current color').fill('Beta pending save');
    await page.getByRole('button', { name: 'Save color', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.personal-palette [role="status"]')?.textContent === 'Saving palette…');
    await colorDisclosure.click();
    assert.equal(await colorDisclosure.getAttribute('aria-expanded'), 'false');
    await changeSession('account-c', 'session-c');
    await page.getByText('Cobalt', { exact: true }).waitFor({ state: 'attached' });

    // A separate unsaved draft checks that the form's private React state is
    // discarded too, while the save from the earlier session remains pending.
    await colorDisclosure.click();
    await page.getByLabel('Name the current color').fill('C private draft');
    await colorDisclosure.click();
    await changeSession('account-d', 'session-d');
    await page.getByText('Dawn', { exact: true }).waitFor({ state: 'attached' });
    // Deliver the old save after session D is already active and Color is still closed.
    blocked.get('PUT:session-b').release();
    await waitForCompletion('PUT:session-b', 1);
    await colorDisclosure.click();

    assert.equal(await page.getByRole('button', { name: 'Use Dawn (#E5A25B)', exact: true }).count(), 1);
    for (const staleName of ['Alpha private', 'Beta private', 'Beta pending save', 'C private draft']) {
      assert.equal(await page.getByText(staleName, { exact: true }).count(), 0, `${staleName} is not exposed to session D`);
    }
    assert.equal(await page.getByLabel('Name the current color').inputValue(), '', 'old name drafts do not survive an account change');
    assert.deepEqual(requests, [
      { method: 'GET', session: 'session-a' },
      { method: 'GET', session: 'session-b' },
      { method: 'PUT', session: 'session-b' },
      { method: 'GET', session: 'session-c' },
      { method: 'GET', session: 'session-d' },
    ], 'disclosure toggles do not trigger extra loads or send a previous session header');
    const drawingAfter = await page.evaluate(() => ({
      project: localStorage.getItem('cloudpainter-project-v1'),
      pixel: (() => {
        const canvas = document.querySelector('canvas.draw-surface');
        return [...canvas.getContext('2d').getImageData(Math.floor(canvas.width * 0.48), Math.floor(canvas.height * 0.5), 1, 1).data];
      })(),
    }));
    assert.deepEqual(drawingAfter, drawingBefore, 'account transitions and late palette responses do not change the local drawing');
  } finally {
    await context.close();
  }
}
