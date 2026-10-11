import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
    expect(screen.getByText(/Poe chooses the image provider/i)).toBeTruthy();
    expect(screen.getByText(/connected Poe account’s points/i)).toBeTruthy();
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
