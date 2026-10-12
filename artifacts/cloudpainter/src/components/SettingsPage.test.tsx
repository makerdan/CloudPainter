import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { DEFAULT_SETTINGS } from "@/lib/settingsPersistence";
import { TextScaleController } from "./TextScaleController";
import SettingsPage from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  retry: vi.fn(),
  error: "",
  saveError: "",
  conflict: false,
  expired: false,
  accountId: "user_avery",
  setLocation: vi.fn(),
  settings: { textSize: 100, drawingTool: "brush", brushStyle: "round", brushSize: 8 },
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { id: mocks.accountId, fullName: "Avery Artist", firstName: "Avery", primaryEmailAddress: { emailAddress: "avery@example.test" } },
  }),
}));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: { children: unknown; href: string; [key: string]: unknown }) =>
    createElement("a", props, children),
  useLocation: () => ["/settings", mocks.setLocation],
}));
vi.mock("@/components/AccountSettings", () => ({
  useAccountSettings: () => ({
    settings: mocks.settings,
    ready: true,
    busy: false,
    error: mocks.error,
    saveError: mocks.saveError,
    conflict: mocks.conflict,
    expired: mocks.expired,
    signedIn: true,
    save: mocks.save,
    retry: mocks.retry,
  }),
}));

describe("CloudPainter settings screen", () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue("saved");
    mocks.retry.mockReset();
    mocks.error = "";
    mocks.saveError = "";
    mocks.conflict = false;
    mocks.expired = false;
    mocks.accountId = "user_avery";
    mocks.setLocation.mockReset();
    mocks.settings = { ...DEFAULT_SETTINGS };
  });
  afterEach(() => {
    cleanup();
    document.getElementById("root")?.remove();
  });

  it("shows the account, enforces text bounds, resets size, and saves drawing defaults", async () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("text-settings-account").textContent).toBe("Avery Artist");
    const increase = screen.getByTestId("button-text-size-increase");
    for (let i = 0; i < 4; i += 1) fireEvent.click(increase);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("140%");
    expect((increase as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-text-size-reset"));
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("100%");
    const decrease = screen.getByTestId("button-text-size-decrease");
    fireEvent.click(decrease);
    fireEvent.click(decrease);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("80%");
    expect((decrease as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByTestId("button-text-size-reset"));
    fireEvent.click(screen.getByTestId("button-drawing-tool-pen"));
    fireEvent.click(screen.getByTestId("button-brush-style-soft"));
    fireEvent.change(screen.getByTestId("input-settings-brush-size"), { target: { value: "27" } });
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    fireEvent.click(screen.getByTestId("button-settings-save"));

    await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({
      textSize: 110,
      drawingTool: "pen",
      brushStyle: "soft",
      brushSize: 27,
    }));
    expect((await screen.findByTestId("status-settings-save")).textContent).toContain("Preferences saved to your account.");
  });

  it("applies the saved text scale to existing and newly rendered interface content", async () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    render(createElement(TextScaleController, { textSize: 120 }), { container: root });
    await waitFor(() => expect(root.style.getPropertyValue("--cloudpainter-text-scale")).toBe("1.2"));
    const added = document.createElement("span");
    added.textContent = "Later content";
    root.append(added);
    await waitFor(() => expect(added.hasAttribute("data-cloudpainter-text-scale")).toBe(true));
    expect(added.style.getPropertyValue("--cloudpainter-base-font-size")).not.toBe("");
  });

  it("keeps edited preferences available after a failed save and retries the same draft", async () => {
    mocks.save.mockReset().mockResolvedValueOnce("failed").mockResolvedValueOnce("saved");
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    fireEvent.click(screen.getByTestId("button-drawing-tool-pen"));
    const draft = { textSize: 110, drawingTool: "pen", brushStyle: "round", brushSize: 8 };

    fireEvent.click(screen.getByTestId("button-settings-save"));
    expect((await screen.findByTestId("status-settings-save")).textContent).toMatch(/edits are still here/i);
    expect(screen.getByTestId("status-settings-save").textContent).not.toMatch(/preferences saved/i);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");
    expect(screen.getByTestId("button-drawing-tool-pen").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("button-settings-save"));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save).toHaveBeenNthCalledWith(1, draft);
    expect(mocks.save).toHaveBeenNthCalledWith(2, draft);
    expect((await screen.findByTestId("status-settings-save")).textContent).toContain("Preferences saved to your account.");
  });

  it("reports a revision conflict without replacing the edited values", async () => {
    mocks.save.mockReset().mockResolvedValueOnce("conflict");
    mocks.saveError = "Your settings changed on another device.";
    mocks.conflict = true;
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    fireEvent.click(screen.getByTestId("button-settings-save"));

    expect((await screen.findByTestId("status-settings-save")).textContent).toMatch(/another device/i);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");
    expect(screen.getByTestId("button-settings-save").textContent).toContain("Retry save preferences");
    expect(screen.getByTestId("button-settings-load-latest")).toBeTruthy();
  });

  it("keeps edits if loading the latest settings fails and replaces them only after a successful load", async () => {
    mocks.saveError = "A previous save failed.";
    mocks.retry
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        revision: 4,
        settings: { ...DEFAULT_SETTINGS, textSize: 130, drawingTool: "pencil" },
      });
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    fireEvent.click(screen.getByTestId("button-drawing-tool-pen"));
    const loadLatest = screen.getByTestId("button-settings-load-latest");

    fireEvent.click(loadLatest);
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");
    expect(screen.getByTestId("button-drawing-tool-pen").getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByTestId("button-settings-load-latest"));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("value-settings-text-size").textContent).toBe("130%"));
    expect(screen.getByTestId("button-drawing-tool-pencil").getAttribute("aria-pressed")).toBe("true");
  });

  it("updates the draft only after a successful settings-load retry", async () => {
    mocks.error = "Settings could not load.";
    mocks.retry.mockResolvedValueOnce(null).mockResolvedValueOnce({
      revision: 3,
      settings: { ...DEFAULT_SETTINGS, textSize: 120 },
    });
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));

    fireEvent.click(screen.getByTestId("button-settings-retry"));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");

    fireEvent.click(screen.getByTestId("button-settings-retry"));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByTestId("value-settings-text-size").textContent).toBe("120%"));
  });

  it("keeps edits visible and offers sign-in recovery after an expired-session save failure", async () => {
    mocks.save.mockReset().mockResolvedValue("expired");
    render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    fireEvent.click(screen.getByTestId("button-settings-save"));

    expect((await screen.findByTestId("status-settings-save")).textContent).toMatch(/session expired/i);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");
    expect(screen.getByTestId("link-settings-renew-save-session").textContent).toContain("Sign in again");
  });

  it("does not carry an unsaved draft into a different signed-in account", async () => {
    const { rerender } = render(<SettingsPage />);
    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("110%");

    mocks.accountId = "user_b";
    mocks.settings = { ...DEFAULT_SETTINGS, textSize: 90, brushSize: 24 };
    rerender(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("value-settings-text-size").textContent).toBe("90%");
      expect(screen.getByTestId("value-settings-brush-size").textContent).toBe("24 px");
    });
  });

  it("refreshes clean preferences for the same account but keeps a dirty draft", async () => {
    const { rerender } = render(<SettingsPage />);
    mocks.settings = { ...DEFAULT_SETTINGS, textSize: 120 };
    rerender(<SettingsPage />);
    await waitFor(() => expect(screen.getByTestId("value-settings-text-size").textContent).toBe("120%"));

    fireEvent.click(screen.getByTestId("button-text-size-increase"));
    mocks.settings = { ...DEFAULT_SETTINGS, textSize: 90, brushSize: 18 };
    rerender(<SettingsPage />);
    expect(screen.getByTestId("value-settings-text-size").textContent).toBe("130%");
    expect(screen.getByTestId("value-settings-brush-size").textContent).toBe("8 px");
  });
});
