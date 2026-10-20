import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { startCloudPainterTestServer } from '../../../scripts/runtime/owned-server.mjs';
import { after, before, test } from 'node:test';
import { chromium } from 'playwright-core';

const fixtures = [
  {
    name: 'dog portrait',
    expectedLabel: 'dog',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Dog_portrait_Budapest.jpg/960px-Dog_portrait_Budapest.jpg',
  },
  {
    name: 'two cats indoors',
    expectedLabel: 'cat',
    url: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Flickr_-_Per_Ola_Wiberg_~_mostly_away_-_Fritz_%5E_Laban_watching_TV.jpg',
  },
  {
    name: 'dog outdoors',
    expectedLabel: 'dog',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c4/Abandoned_Dog.jpg',
  },
  {
    name: 'cat in low light',
    expectedLabel: 'cat',
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/9/90/A_cat_in_a_low_light_corridor.jpg/960px-A_cat_in_a_low_light_corridor.jpg',
  },
];
const FIXTURE_TIMEOUT_MS = 15_000;
const MAX_FIXTURE_BYTES = 4 * 1024 * 1024;
const MODEL_TIMEOUT_MS = 90_000;
const HARNESS = `<!doctype html>
<meta charset="utf-8">
<script type="module">
  import { runLocalOutline } from '/src/lib/outlineInference.ts';
  window.runOutlineFixture = async (source) => {
    const image = new Image();
    image.src = source;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not decode the public fixture in a canvas.');
    context.drawImage(image, 0, 0);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ${MODEL_TIMEOUT_MS + 1000});
    try {
      return await runLocalOutline(
        canvas.toDataURL('image/png'),
        { x: 0, y: 0, width: 1, height: 1 },
        0.5,
        controller.signal,
        message => window.reportOutlineStatus(message),
      );
    } finally {
      clearTimeout(timer);
    }
  };
</script>`;

let ownedServer;
let browser;
let appUrl;

async function readPublicFixture(fixture) {
  const response = await fetch(fixture.url, { signal: AbortSignal.timeout(FIXTURE_TIMEOUT_MS) });
  assert.ok(response.ok, `Fixture download failed (${response.status}): ${fixture.url}`);
  assert.match(response.headers.get('content-type') ?? '', /^image\/(?:jpeg|png)\b/i,
    `Expected a public JPEG or PNG fixture: ${fixture.url}`);
  const reader = response.body.getReader();
  const chunks = [];
  let byteCount = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteCount += value.byteLength;
    assert.ok(byteCount <= MAX_FIXTURE_BYTES, `Fixture exceeds ${MAX_FIXTURE_BYTES} bytes: ${fixture.url}`);
    chunks.push(Buffer.from(value));
  }
  assert.ok(byteCount > 0, `Fixture was empty: ${fixture.url}`);
  return Buffer.concat(chunks).toString('base64');
}

function contourBounds(points) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, spanX: maxX - minX, spanY: maxY - minY };
}

before(async () => {
  ownedServer = await startCloudPainterTestServer();
  appUrl = ownedServer.url;
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_PATH || execFileSync('which', ['chromium'], { encoding: 'utf8' }).trim(),
    args: ['--no-sandbox'],
  });
});

after(async () => {
  try { await browser?.close(); }
  finally { await ownedServer?.stop(); }
});

test('varied public dog and cat fixtures retain usable local subject outlines', { timeout: 420_000 }, async () => {
  assert.doesNotMatch(HARNESS, /runHostedOutline|outlineHosted|\/api\/outline|poe\.com|poecdn/);
  const fixtureImages = await Promise.all(fixtures.map(async fixture => {
    try {
      return [fixture, await readPublicFixture(fixture)];
    } catch (error) {
      console.error(`[outline-fixture][${fixture.name}] download failed: ${error.message}`);
      throw error;
    }
  }));

  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const statuses = [];
    const browserErrors = [];
    const hostedRequests = [];
    await page.exposeFunction('reportOutlineStatus', message => {
      statuses.push(String(message));
      console.log(`[outline-model] ${String(message)}`);
    });
    page.on('pageerror', error => browserErrors.push(error.message));
    page.on('request', request => {
      const url = request.url();
      if (/poe\.com|poecdn|\/api\/outline/i.test(url)) hostedRequests.push(url);
    });
    await page.route('**/__outline_subject_regression__', route => route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: HARNESS,
    }));
    await page.goto(new URL('__outline_subject_regression__', appUrl).toString());
    await page.waitForFunction(() => typeof window.runOutlineFixture === 'function', undefined, { timeout: 15_000 });

    for (const [fixture, base64] of fixtureImages) {
      const statusStart = statuses.length;
      console.log(`[outline-model][${fixture.name}] Running one local model attempt; fixture: ${fixture.url}`);
      let candidates;
      try {
        candidates = await page.evaluate(image => window.runOutlineFixture(`data:image/jpeg;base64,${image}`), base64);
      } catch (error) {
        const phase = statuses.slice(statusStart).at(-1) ?? 'no model status received';
        const detail = browserErrors.length ? ` Browser errors: ${browserErrors.join('; ')}` : '';
        console.error(`[outline-model][${fixture.name}] ${phase}; model loading or inference failed: ${error.message}.${detail}`);
        throw error;
      }

      const labels = [...new Set(candidates.map(candidate => candidate.label))];
      console.log(`[outline-model][${fixture.name}] Candidate labels: ${labels.join(', ') || '(none)'}`);
      const subjectContours = candidates.filter(candidate =>
        candidate.label.split(' · boundary ')[0].trim().toLowerCase() === fixture.expectedLabel);
      assert.ok(subjectContours.length > 0,
        `Expected a ${fixture.expectedLabel} subject label; model returned: ${labels.join(', ') || '(none)'}`);

      for (const contour of subjectContours) {
        const bounds = contourBounds(contour.points);
        assert.ok(!(bounds.spanX >= 0.9 && bounds.spanY >= 0.9),
          `Selected ${fixture.expectedLabel} contour became photo-wide (${bounds.spanX.toFixed(3)} × ${bounds.spanY.toFixed(3)}): ${contour.label}`);
      }
      console.log(`[outline-model][${fixture.name}] Passed: ${subjectContours.length} usable ${fixture.expectedLabel} contour(s); photo-wide masks were not offered.`);
    }
    assert.deepEqual(hostedRequests, [], 'The on-device regression check must not call hosted inference.');
  } finally {
    await context.close();
  }
});
