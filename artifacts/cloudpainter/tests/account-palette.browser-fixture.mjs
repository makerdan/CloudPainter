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
