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
  account: { signedIn: true, userId: "fixture-user" },
}));

vi.mock("@workspace/api-client-react", () => ({
  getGetImageGenerationConfigQueryKey: () => ["/api/images/config"],
  upscalePoeImage: mocks.upscale,
  useGetImageGenerationConfig: () => mocks.configuration,
}));
vi.mock("./Account", () => ({
  usePaletteAccount: () => ({
    userId: mocks.account.signedIn ? mocks.account.userId : undefined,
    sessionId: "fixture-session",
    isLoaded: true,
  }),
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
  mocks.account.signedIn = true;
  mocks.account.userId = "fixture-user";
  mocks.configuration.data = {
    configured: true,
    signedIn: true,
    allowed: true,
    dailyLimit: 2,
    remaining: 2,
    globalRemaining: 20,
  };
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
    expect(panel.textContent).not.toMatch(/Assistant chooses the image provider|Please upscale the attached image|merged photo and visible layers are sent to Poe|may use Poe points|Sign in with an approved account/i);
    expect(controls.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect([...panel.querySelectorAll("p")].every(paragraph => Boolean(paragraph.textContent?.trim()))).toBe(true);
  });

  it("keeps review unavailable to signed-out users without showing the removed sign-in prompt", () => {
    mocks.account.signedIn = false;
    renderExport();
    const panel = screen.getByRole("region", { name: "Poe Assistant upscale export" });
    expect((within(panel).getByRole("combobox", { name: "Poe Assistant upscale factor" }) as HTMLSelectElement).disabled).toBe(false);
    expect((within(panel).getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(true);
    expect(panel.textContent).not.toMatch(/Sign in with an approved account|connected Poe account/i);
    expect(within(panel).queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("keeps disabled accounts gated with an actionable status", () => {
    mocks.configuration.data = { ...mocks.configuration.data, allowed: false };
    renderExport();
    const panel = screen.getByRole("region", { name: "Poe Assistant upscale export" });
    expect(within(panel).getByText("Poe image access is disabled for this account. Ask the project owner for help.")).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([4, 8] as const)("sends the merged PNG only after confirmation and downloads the validated %s× result", async scale => {
    const user = userEvent.setup();
    const resultBytes = Buffer.from(mergedBytes).toString("base64");
    mocks.upscale.mockResolvedValue({ b64_json: resultBytes, mime: "image/png", width: 120 * scale, height: 80 * scale });
    const savedProject = structuredClone(projectSnapshot);
    const { composeImage } = renderExport();
    const selector = screen.getByTestId("select-upscale-factor");
    await user.selectOptions(selector, String(scale));
    expect(composeImage).not.toHaveBeenCalled();
    expect(mocks.upscale).not.toHaveBeenCalled();
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
      {
        name: "malformed base64",
        result: { ...validResult, b64_json: "not base64!" },
        message: "Poe did not return a valid PNG. No file was downloaded.",
      },
      {
        name: "non-string image data",
        result: { ...validResult, b64_json: null as unknown as string },
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

  it("rejects an oversized encoded result before base64 decoding or download", async () => {
    const user = userEvent.setup();
    const atobSpy = vi.spyOn(globalThis, "atob");
    mocks.upscale.mockResolvedValue({
      b64_json: "A".repeat(16 * 1024 * 1024 + 4),
      mime: "image/png",
      width: 480,
      height: 320,
    });
    renderExport();
    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));

    expect((await screen.findByTestId("upscale-error")).textContent)
      .toBe("Poe returned an image outside the supported size limit. No file was downloaded.");
    expect(atobSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("upscale-status")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it("rejects an oversized decoded result without retaining an earlier download status", async () => {
    const user = userEvent.setup();
    const atobSpy = vi.spyOn(globalThis, "atob");
    const validResult = {
      b64_json: Buffer.from(mergedBytes).toString("base64"),
      mime: "image/png",
      width: 480,
      height: 320,
    };
    mocks.upscale.mockResolvedValueOnce(validResult).mockResolvedValueOnce(validResult);
    renderExport();

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(screen.getByTestId("upscale-status").textContent).toContain("downloaded"));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();

    atobSpy.mockReturnValue("x".repeat(12 * 1024 * 1024 + 1));
    await user.click(screen.getByRole("button", { name: "Review 4× export" }));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    expect((await screen.findByTestId("upscale-error")).textContent)
      .toBe("Poe returned an image outside the supported size limit. No file was downloaded.");
    expect(screen.queryByTestId("upscale-status")).toBeNull();
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
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

  it("does not send a composition that finishes after Stop during preparation", async () => {
    const user = userEvent.setup();
    let resolveComposition!: (blob: Blob) => void;
    const deferredComposition = new Promise<Blob>(resolve => { resolveComposition = resolve; });
    const composeImage = vi.fn(() => deferredComposition);
    render(<PoeUpscaleExport composeImage={composeImage} title="fixture project" width={120} height={80} />);

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    expect(screen.getByText("Preparing the merged composition…")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Stop request" }));
    expect(screen.queryByRole("dialog")).toBeNull();

    await act(async () => {
      resolveComposition(new Blob([mergedBytes], { type: "image/png" }));
      await deferredComposition;
    });
    expect(mocks.upscale).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("does not dispatch if Stop happens while the prepared PNG is being encoded", async () => {
    const user = userEvent.setup();
    const readAsDataURL = vi.spyOn(FileReader.prototype, "readAsDataURL").mockImplementation(() => {});
    const { composeImage } = renderExport();

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(readAsDataURL).toHaveBeenCalledOnce());
    const reader = readAsDataURL.mock.contexts[0] as FileReader;
    await user.click(screen.getByRole("button", { name: "Stop request" }));
    expect(mocks.upscale).not.toHaveBeenCalled();

    await act(async () => {
      Object.defineProperty(reader, "result", {
        configurable: true,
        value: `data:image/png;base64,${Buffer.from(mergedBytes).toString("base64")}`,
      });
      reader.dispatchEvent(new ProgressEvent("load"));
    });
    expect(composeImage).toHaveBeenCalledOnce();
    expect(mocks.upscale).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
  });

  it.each(["Escape", "close button", "outside click"] as const)(
    "closes and aborts a processing review through the %s, discarding its late result",
    async closeMethod => {
    const user = userEvent.setup();
    type UpscaleResult = { b64_json: string; mime: string; width: number; height: number };
    let resolveRequest!: (result: UpscaleResult) => void;
    const deferredRequest = new Promise<UpscaleResult>(resolve => { resolveRequest = resolve; });
    mocks.upscale.mockReturnValueOnce(deferredRequest);
    renderExport();

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledOnce());
    const signal = mocks.upscale.mock.calls[0][1].signal as AbortSignal;
    if (closeMethod === "Escape") {
      await user.keyboard("{Escape}");
    } else if (closeMethod === "close button") {
      await user.click(screen.getByRole("button", { name: "Close" }));
    } else {
      const overlay = screen.getByRole("dialog").previousElementSibling;
      expect(overlay).toBeTruthy();
      await user.click(overlay as Element);
    }
    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect((screen.getByTestId("button-upscale-export") as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      resolveRequest({
        b64_json: Buffer.from(mergedBytes).toString("base64"),
        mime: "image/png",
        width: 480,
        height: 320,
      });
      await deferredRequest;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(screen.queryByText(/Upscaled PNG downloaded/)).toBeNull();
    await waitFor(() => expect((screen.getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(false));
    },
  );

  it("discards an old account result without affecting a new account request", async () => {
    const user = userEvent.setup();
    type UpscaleResult = { b64_json: string; mime: string; width: number; height: number };
    let resolveOldRequest!: (result: UpscaleResult) => void;
    let resolveNewRequest!: (result: UpscaleResult) => void;
    const deferredOldRequest = new Promise<UpscaleResult>(resolve => { resolveOldRequest = resolve; });
    const deferredNewRequest = new Promise<UpscaleResult>(resolve => { resolveNewRequest = resolve; });
    const validResult = {
      b64_json: Buffer.from(mergedBytes).toString("base64"),
      mime: "image/png",
      width: 480,
      height: 320,
    };
    mocks.upscale.mockReturnValueOnce(deferredOldRequest).mockReturnValueOnce(deferredNewRequest);
    const composeImage = vi.fn(async () => new Blob([mergedBytes], { type: "image/png" }));
    const view = render(<PoeUpscaleExport composeImage={composeImage} title="fixture project" width={120} height={80} />);

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledOnce());
    const oldSignal = mocks.upscale.mock.calls[0][1].signal as AbortSignal;

    mocks.account.userId = "another-user";
    view.rerender(<PoeUpscaleExport composeImage={composeImage} title="fixture project" width={120} height={80} />);
    await waitFor(() => expect(oldSignal.aborted).toBe(true));
    await waitFor(() => expect((screen.getByRole("button", { name: "Review 4× export" }) as HTMLButtonElement).disabled).toBe(false));

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledTimes(2));

    await act(async () => {
      resolveOldRequest(validResult);
      await deferredOldRequest;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(screen.queryByText(/Upscaled PNG downloaded/)).toBeNull();
    expect((screen.getByTestId("button-upscale-export") as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.configuration.refetch).not.toHaveBeenCalled();

    await act(async () => {
      resolveNewRequest(validResult);
      await deferredNewRequest;
    });
    await waitFor(() => expect(screen.getByTestId("upscale-status").textContent).toContain("downloaded"));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it("aborts a pending upscale on unmount and ignores its late result", async () => {
    const user = userEvent.setup();
    type UpscaleResult = { b64_json: string; mime: string; width: number; height: number };
    let resolveRequest!: (result: UpscaleResult) => void;
    const deferredRequest = new Promise<UpscaleResult>(resolve => { resolveRequest = resolve; });
    mocks.upscale.mockReturnValue(deferredRequest);
    const view = renderExport();

    await user.click(screen.getByTestId("button-upscale-export"));
    await user.click(screen.getByTestId("button-confirm-upscale"));
    await waitFor(() => expect(mocks.upscale).toHaveBeenCalledOnce());
    const signal = mocks.upscale.mock.calls[0][1].signal as AbortSignal;
    view.unmount();
    expect(signal.aborted).toBe(true);

    await act(async () => {
      resolveRequest({
        b64_json: Buffer.from(mergedBytes).toString("base64"),
        mime: "image/png",
        width: 480,
        height: 320,
      });
      await deferredRequest;
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
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
