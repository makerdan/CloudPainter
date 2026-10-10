/**
 * Reusable, bill-free browser check for the CloudPainter logo journey.
 *
 * Run from a Playwright harness that supplies:
 *   - page: a Playwright Page
 *   - context: its BrowserContext
 *   - baselineProject: localStorage["cloudpainter-project-v1"] captured after
 *     importing/drawing/saving the sketch, before opening /logo-options
 *
 * The interceptor is installed before visiting the logo route. This script
 * deliberately does not call the live image-generation provider.
 */
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directions = ["cloudline", "viewfinder", "gesture", "paperfold", "sunstudy"];
const optionIds = directions.map((id) => `logo-option-${id}`);

export async function runCloudPainterLogoMockPass({
  page,
  context,
  baselineProject,
}) {
  assert.ok(page && context, "Pass a Playwright page and its browser context.");
  assert.ok(baselineProject, "Capture the saved sketch project before the journey.");

  const state = { mode: "success", pngBase64: "" };
  const requests = [];

  // This route must be installed before any UI submission.
  await context.route("**/api/logo-images", async (route) => {
    const request = route.request();
    let body = {};
    try {
      body = request.postDataJSON();
    } catch {
      // Retain malformed bodies for useful assertion output.
    }
    requests.push({ method: request.method(), body });

    if (state.mode === "success") {
      await new Promise((resolve) => setTimeout(resolve, 700));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          pngBase64: state.pngBase64,
          width: 1024,
          height: 1024,
        }),
      });
    } else if (state.mode === "refusal") {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
           code: "REFUSED",
           message: "private provider refusal details",
           retryable: false,
        }),
      });
    } else {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
           code: "PROVIDER_FAILED",
           message: "internal failure: private stack details",
           retryable: true,
        }),
      });
    }
  });

  await page.goto("/logo-options");
  assert.equal(await page.locator('[data-testid^="logo-option-"]').count(), 5);
  assert.equal(await page.locator('[data-testid^="preview-header-"]').count(), 5);
  assert.equal(await page.locator('[data-testid^="preview-favicon-"]').count(), 5);
  for (const id of optionIds) assert.equal(await page.getByTestId(id).count(), 1);

  // Make a valid 1024 square PNG in browser memory; no fixture file or service
  // is required.
  state.pngBase64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#f3eadb";
    ctx.fillRect(0, 0, 1024, 1024);
    ctx.fillStyle = "#315d4d";
    ctx.beginPath();
    ctx.arc(512, 512, 240, 0, Math.PI * 2);
    ctx.fill();
    return canvas.toDataURL("image/png").split(",")[1];
  });

  const prompt = page.getByTestId("input-logo-prompt");
  const status = page.getByTestId("status-logo-generation");
  const generate = page.getByTestId("button-generate-logo");

  await prompt.fill("");
  await generate.click();
  assert.match(await status.innerText(), /Describe the logo concept first/i);
  assert.equal(requests.length, 0, "Empty prompts must not reach the API.");

  await prompt.fill("x".repeat(1201));
  await generate.click();
  assert.match(await status.innerText(), /within 1200 characters/i);
  assert.equal(requests.length, 0, "Over-limit prompts must not reach the API.");

  await prompt.fill("A quiet blue cloud symbol");
  await page.getByTestId("select-logo-direction").selectOption("cloudline");
  await generate.click();
  assert.equal(await generate.isDisabled(), true);
  assert.match(await status.innerText(), /Generating/i);
  await page.keyboard.press("Control+Enter");
  await page.getByTestId("img-logo-result").waitFor({ state: "visible" });
  assert.equal(requests.length, 1, "Keyboard submission must not duplicate the request.");
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["direction", "prompt"]);
  assert.deepEqual(requests[0].body, {
    prompt: "A quiet blue cloud symbol",
    direction: "cloudline",
  });
  assert.match(await status.innerText(), /Concept ready/i);

  // Read the actual downloaded file and check its PNG signature and IHDR.
  const outputDir = await mkdtemp(join(tmpdir(), "cloudpainter-logo-"));
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByTestId("button-download-logo").click(),
    ]);
    const file = join(outputDir, download.suggestedFilename());
    await download.saveAs(file);
    const bytes = await readFile(file);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.equal(bytes.readUInt32BE(16), 1024);
    assert.equal(bytes.readUInt32BE(20), 1024);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }

  state.mode = "refusal";
  const refusalResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/api/logo-images"),
  );
  await generate.click();
  await refusalResponse;
   await page.waitForFunction(() => document.querySelector('[data-testid="status-logo-generation"]')?.textContent?.includes("different wording"));
   assert.equal(await page.getByTestId("button-retry-logo").count(), 0);
   assert.match(await status.innerText(), /different wording/i);
  assert.match(await page.getByTestId("img-logo-result").getAttribute("alt"), /generated/i);
  assert.match(await page.locator("body").innerText(), /previous result kept/i);

  state.mode = "failure";
  const failureResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith("/api/logo-images"),
  );
  await generate.click();
  await failureResponse;
  assert.match(await status.innerText(), /could not be created/i);
  const pageText = await page.locator("body").innerText();
  assert.doesNotMatch(pageText, /internal failure|private stack details/i);
  assert.match(pageText, /previous result kept/i);

  // A delayed in-flight request must not recreate state after navigating away.
  state.mode = "success";
  await generate.click();
  assert.match(await status.innerText(), /Generating/i);
  await page.getByTestId("link-return-workspace").click();
   // An aborted navigation request may never produce a response event.
  await page.waitForTimeout(800);
  assert.equal(await page.getByTestId("img-reference").count(), 1);
  assert.equal(await page.locator('[data-testid^="layer-row-"]').count(), 1);
  assert.equal(await page.getByTestId("img-logo-result").count(), 0);
  assert.equal(
    await page.evaluate(() => localStorage.getItem("cloudpainter-project-v1")),
    baselineProject,
  );
  await page.getByTestId("link-logo-options").click();
  assert.equal(await page.getByTestId("img-logo-result").count(), 0);

  // The mobile viewport must not add horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  const widths = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  assert.ok(widths.scroll <= widths.client, `Horizontal overflow: ${JSON.stringify(widths)}`);

  return { requests, mobileWidths: widths };
}
