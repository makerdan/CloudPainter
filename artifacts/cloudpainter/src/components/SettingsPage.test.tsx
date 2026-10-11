import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { DEFAULT_SETTINGS } from "@/lib/settingsPersistence";
import { TextScaleController } from "./TextScaleController";
import SettingsPage from "./SettingsPage";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  retry: vi.fn(),
  setLocation: vi.fn(),
  settings: { textSize: 100, drawingTool: "brush", brushStyle: "round", brushSize: 8 },
}));

vi.mock("@clerk/react", () => ({
  useUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { fullName: "Avery Artist", firstName: "Avery", primaryEmailAddress: { emailAddress: "avery@example.test" } },
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
    error: "",
    expired: false,
    signedIn: true,
    save: mocks.save,
    retry: mocks.retry,
  }),
}));

describe("CloudPainter settings screen", () => {
  beforeEach(() => {
    mocks.save.mockReset().mockResolvedValue(true);
    mocks.retry.mockReset();
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
});
