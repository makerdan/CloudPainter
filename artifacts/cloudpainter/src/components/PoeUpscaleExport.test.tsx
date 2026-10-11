import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PoeUpscaleExport } from "./PoeUpscaleExport";

const mocks = vi.hoisted(() => ({
  upscale: vi.fn(),
  configuration: {
    data: { configured: true, signedIn: true, allowed: true, dailyLimit: 2, remaining: 2, globalRemaining: 20 },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetImageGenerationConfigQueryKey: () => ["/api/images/config"],
  upscalePoeImage: mocks.upscale,
  useGetImageGenerationConfig: () => mocks.configuration,
}));
vi.mock("./Account", () => ({
  usePaletteAccount: () => ({ userId: "fixture-user", sessionId: "fixture-session", isLoaded: true }),
}));

const mergedBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const projectSnapshot = { title: "fixture", visibleLayers: ["photo", "ink"], savedAt: "unchanged" };

function renderExport() {
  const composeImage = vi.fn(async () => new Blob([mergedBytes], { type: "image/png" }));
  const view = render(<PoeUpscaleExport composeImage={composeImage} title="fixture project" width={120} height={80} />);
  return { ...view, composeImage };
}

beforeEach(() => {
  mocks.upscale.mockReset();
  mocks.configuration.refetch.mockReset();
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:upscale-fixture") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Poe Assistant upscale export", () => {
  it("keeps accessible export controls and attempt counts without static notices or empty notice blocks", () => {
    renderExport();
    const panel = screen.getByRole("region", { name: "Poe Assistant upscale export" });
    const controls = within(panel);
    expect(controls.getByRole("heading", { name: "Poe Assistant upscale export" })).toBeTruthy();
    expect((controls.getByRole("combobox", { name: "Poe Assistant upscale factor" }) as HTMLSelectElement).disabled).toBe(false);
    expect(controls.getAllByRole("option").map(option => option.textContent)).toEqual(["4×", "8×"]);
    expect((controls.getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(false);
    expect(controls.getByText(/2 of 2 account attempts and 20 shared attempts remain today/)).toBeTruthy();
    expect(controls.queryByText(/Poe chooses the provider|Poe chooses the image provider|Please upscale the attached image|After you confirm|Avoid sensitive images/)).toBeNull();
    expect(controls.queryByRole("link", { name: "Poe privacy policy" })).toBeNull();
    expect(controls.queryByTestId("upscale-route-disclosure")).toBeNull();
    expect(panel.querySelector(".upscale-unavailable-label, .upscale-export-disclosure, .upscale-export-heading")).toBeNull();
    expect([...panel.querySelectorAll("p")].every(paragraph => Boolean(paragraph.textContent?.trim()))).toBe(true);
  });

  it.each([4, 8] as const)("sends the merged PNG only after confirmation and downloads the validated %s× result", async scale => {
    const user = userEvent.setup();
    const resultBytes = Buffer.from(mergedBytes).toString("base64");
    mocks.upscale.mockResolvedValue({ b64_json: resultBytes, mime: "image/png", width: 120 * scale, height: 80 * scale });
    const savedProject = structuredClone(projectSnapshot);
    const { composeImage } = renderExport();
    const selector = screen.getByTestId("select-upscale-factor");
    await user.selectOptions(selector, String(scale));
    await user.click(screen.getByTestId("button-upscale-export"));
    expect(mocks.upscale).not.toHaveBeenCalled();
    expect(composeImage).not.toHaveBeenCalled();
    const dialog = within(screen.getByRole("dialog", { name: "Send this composition to Poe?" }));
    expect(dialog.getByText(/This sends the merged photo and visible layers to Poe Assistant and may use Poe points\. Assistant chooses the provider/)).toBeTruthy();
    expect(dialog.getByText(new RegExp(`Please upscale the attached image to be ${scale}x`))).toBeTruthy();
    expect(dialog.getByText(new RegExp(`exactly ${120 * scale} × ${80 * scale} pixels`))).toBeTruthy();
    expect(dialog.getByText(/Poe may still use points if it fails or is cancelled after processing starts/)).toBeTruthy();
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledTimes(1));
    const [request, options] = mocks.upscale.mock.calls[0];
    expect(request).toEqual({ pngBase64: Buffer.from(mergedBytes).toString("base64"), scale });
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(composeImage).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByTestId("upscale-status").textContent).toContain("downloaded"));
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(savedProject).toEqual(projectSnapshot);
  });

  describe.each([4, 8] as const)("%s× invalid results", scale => {
    const validResult = {
      b64_json: Buffer.from(mergedBytes).toString("base64"),
      mime: "image/png",
      width: 120 * scale,
      height: 80 * scale,
    };
    const metadataError = "Poe did not return a PNG at the exact requested dimensions. No file was downloaded.";

    it.each([
      { name: "wrong width", result: { ...validResult, width: validResult.width - 1 }, message: metadataError },
      { name: "wrong height", result: { ...validResult, height: validResult.height - 1 }, message: metadataError },
      { name: "wrong MIME type", result: { ...validResult, mime: "image/jpeg" }, message: metadataError },
      {
        name: "invalid PNG signature",
        result: { ...validResult, b64_json: Buffer.from([0, ...mergedBytes.slice(1)]).toString("base64") },
        message: "Poe did not return a valid PNG. No file was downloaded.",
      },
      {
        name: "truncated PNG signature",
        result: { ...validResult, b64_json: Buffer.from(mergedBytes.slice(0, 7)).toString("base64") },
        message: "Poe did not return a valid PNG. No file was downloaded.",
      },
    ])("rejects $name without downloading or automatically retrying", async ({ result, message }) => {
      const user = userEvent.setup();
      mocks.upscale.mockResolvedValue(result);
      const { composeImage } = renderExport();
      await user.selectOptions(screen.getByTestId("select-upscale-factor"), String(scale));
      await user.click(screen.getByTestId("button-upscale-export"));
      const dialog = within(screen.getByRole("dialog", { name: "Send this composition to Poe?" }));
      expect(composeImage).not.toHaveBeenCalled();
      expect(mocks.upscale).not.toHaveBeenCalled();
      await user.click(dialog.getByRole("button", { name: "Send and upscale" }));

      expect((await screen.findByTestId("upscale-error")).textContent).toBe(message);
      await waitFor(() => expect(mocks.configuration.refetch).toHaveBeenCalledOnce());
      expect(composeImage).toHaveBeenCalledOnce();
      expect(mocks.upscale).toHaveBeenCalledExactlyOnceWith(
        { pngBase64: Buffer.from(mergedBytes).toString("base64"), scale },
        { signal: expect.any(AbortSignal) },
      );
      expect(screen.queryByTestId("upscale-status")).toBeNull();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();

      // Finishing and dismissing the failed attempt must not resend the image.
      await user.click(dialog.getByRole("button", { name: "Keep image in browser" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByRole("alert").textContent).toBe(message);
      expect(mocks.upscale).toHaveBeenCalledOnce();
      expect(composeImage).toHaveBeenCalledOnce();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    });
  });

  it.each([4, 8] as const)("cancels a reviewed %s× export without composing, sending, or downloading", async scale => {
    const user = userEvent.setup();
    const { composeImage } = renderExport();
    await user.selectOptions(screen.getByRole("combobox", { name: "Poe Assistant upscale factor" }), String(scale));
    await user.click(screen.getByRole("button", { name: `Review ${scale}× export` }));
    await user.click(screen.getByRole("button", { name: "Keep image in browser" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(composeImage).not.toHaveBeenCalled();
    expect(mocks.upscale).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: `Review ${scale}× export` }) as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["resolve", "reject"] as const)("aborts Stop request and never downloads when the deferred request later %ss", async outcome => {
    const user = userEvent.setup();
    type UpscaleResult = { b64_json: string; mime: string; width: number; height: number };
    let resolveRequest!: (result: UpscaleResult) => void;
    let rejectRequest!: (error: Error) => void;
    const deferredRequest = new Promise<UpscaleResult>((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    // Deliberately ignore abort in the mock: a late provider result must still be discarded.
    mocks.upscale.mockReturnValue(deferredRequest);
    const { composeImage } = renderExport();
    const selector = screen.getByRole("combobox", { name: "Poe Assistant upscale factor" }) as HTMLSelectElement;
    const review = screen.getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement;
    await user.click(review);
    await user.click(screen.getByRole("button", { name: "Send and upscale" }));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledOnce());
    const signal = mocks.upscale.mock.calls[0][1].signal as AbortSignal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(signal.aborted).toBe(false);
    expect(selector.disabled).toBe(true);
    expect(review.disabled).toBe(true);
    expect(screen.getByText("Processing…")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Stop request" }));
    expect(signal.aborted).toBe(true);
    expect(selector.disabled).toBe(true);
    expect(review.disabled).toBe(true);
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(mocks.configuration.refetch).not.toHaveBeenCalled();

    await act(async () => {
      if (outcome === "resolve") {
        resolveRequest({
          b64_json: Buffer.from(mergedBytes).toString("base64"),
          mime: "image/png",
          width: 480,
          height: 320,
        });
      } else {
        rejectRequest(new DOMException("The request was aborted.", "AbortError"));
      }
      await deferredRequest.catch(() => {});
    });
    expect(selector.disabled).toBe(false);
    expect(review.disabled).toBe(false);
    expect(screen.queryByText("Processing…")).toBeNull();
    expect(composeImage).toHaveBeenCalledOnce();
    expect(mocks.upscale).toHaveBeenCalledOnce();
    expect(mocks.configuration.refetch).toHaveBeenCalledOnce();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(screen.queryByTestId("upscale-error")).toBeNull();
    if (outcome === "reject") {
      expect(screen.getByTestId("upscale-status").textContent).toBe(
        "Request stopped. Poe may have charged points if processing had already started; it was not retried.",
      );
    } else {
      expect(screen.getByTestId("upscale-status").textContent).not.toContain("downloaded");
    }
  });

  it("keeps the project unchanged and creates no download after a safe failure", async () => {
    const user = userEvent.setup();
    const savedProject = structuredClone(projectSnapshot);
    mocks.upscale.mockRejectedValue(new Error("provider failed"));
    renderExport();
    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    expect((await screen.findByTestId("upscale-error")).textContent).toContain("provider failed");
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(savedProject).toEqual(projectSnapshot);
  });
});
