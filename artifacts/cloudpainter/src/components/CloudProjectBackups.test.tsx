import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { CloudProjectBackups } from "./CloudProjectBackups";
import type { EditableProject } from "@/lib/projectBackup";

const mocks = vi.hoisted(() => ({
  account: { isLoaded: true, userId: "user_a", sessionId: "session_a" } as {
    isLoaded: boolean;
    userId: string | null;
    sessionId: string | null;
  },
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  remove: vi.fn(),
  export: vi.fn(),
}));

vi.mock("./Account", () => ({
  usePaletteAccount: () => mocks.account,
}));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: { children: unknown; href: string; [key: string]: unknown }) =>
    createElement("a", props, children),
}));
vi.mock("@workspace/api-client-react", () => ({
  listProjectBackups: mocks.list,
  createProjectBackup: mocks.create,
  exportProjectBackups: mocks.export,
  getProjectBackup: mocks.get,
  deleteProjectBackup: mocks.remove,
}));

const project: EditableProject = {
  image: null,
  width: 640,
  height: 480,
  layers: [{ id: "layer-1", name: "Ink", visible: true, opacity: 1, strokes: [], redo: [] }],
  selectedLayerId: "layer-1",
  title: "River study",
  photoZoom: 1,
  photoPan: { x: 0, y: 0 },
  referencePhotoVisible: true,
  referencePhotoOpacity: 100,
};

const summary = {
  id: "a5cdb782-60d0-4f97-8000-3d3918fe61a8",
  title: project.title,
  sizeBytes: 240,
  createdAt: "2026-10-14T12:00:00.000Z",
};

describe("account project backups", () => {
  beforeEach(() => {
    mocks.account = { isLoaded: true, userId: "user_a", sessionId: "session_a" };
    mocks.list.mockReset().mockResolvedValue({ backups: [], totalBytes: 0, accountLimitBytes: 33554432 });
    mocks.create.mockReset().mockResolvedValue(summary);
    mocks.get.mockReset().mockResolvedValue({ ...summary, backup: "saved backup" });
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.export.mockReset().mockResolvedValue(new Blob(["zip archive"]));
  });
  afterEach(() => {
    cleanup();
    document.getElementById("root")?.remove();
  });

  it("does not upload on sign-in or account switch and reloads only the current account list", async () => {
    const view = render(<CloudProjectBackups project={project} open onRestore={vi.fn()} />);
    expect(mocks.list).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("button-toggle-account-backups"));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "X-Project-Session": "session_a" },
    })));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByText(/signing in alone never uploads/i)).toBeTruthy();

    mocks.account = { isLoaded: true, userId: "user_b", sessionId: "session_b" };
    view.rerender(<CloudProjectBackups project={project} open onRestore={vi.fn()} />);
    expect(mocks.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("button-toggle-account-backups"));
    await waitFor(() => expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "X-Project-Session": "session_b" },
    })));
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByText(/no account backups yet/i)).toBeTruthy();
  });

  it("requires explicit confirmation, restores only after confirmation, and supports deletion", async () => {
    mocks.list.mockResolvedValue({ backups: [summary], totalBytes: summary.sizeBytes, accountLimitBytes: 33554432 });
    const onRestore = vi.fn().mockResolvedValue(true);
    render(<CloudProjectBackups project={project} open onRestore={onRestore} />);
    fireEvent.click(screen.getByTestId("button-toggle-account-backups"));
    await waitFor(() => expect(screen.getByText("River study")).toBeTruthy());
    expect(mocks.create).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-start-account-backup"));
    expect(screen.getByText(/including its reference photo/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-confirm-account-backup"));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      backup: expect.stringContaining('"format":"cloudpainter-project"'),
    }), expect.objectContaining({ headers: { "X-Project-Session": "session_a" } })));
    await waitFor(() => expect(screen.getByTestId("account-backup-message").textContent).toMatch(/backed up to your account/i));

    fireEvent.click(screen.getByTestId(`button-restore-account-backup-${summary.id}`));
    fireEvent.click(screen.getByText("Confirm restore"));
    await waitFor(() => expect(mocks.get).toHaveBeenCalledWith(summary.id, expect.objectContaining({
      headers: { "X-Project-Session": "session_a" },
    })));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("saved backup"));

    fireEvent.click(screen.getByTestId(`button-delete-account-backup-${summary.id}`));
    fireEvent.click(screen.getByText("Confirm delete"));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith(summary.id, expect.objectContaining({
      headers: { "X-Project-Session": "session_a" },
    })));
  });

  it("downloads the server-backed account archive and reports export failures", async () => {
    mocks.list.mockResolvedValue({ backups: [summary], totalBytes: summary.sizeBytes, accountLimitBytes: 33554432 });
    const createObjectURL = vi.fn(() => "blob:account-backups");
    const revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    vi.stubGlobal("URL", Object.assign(globalThis.URL, { createObjectURL, revokeObjectURL }));
    const view = render(<CloudProjectBackups project={project} open onRestore={vi.fn()} />);
    fireEvent.click(screen.getByTestId("button-toggle-account-backups"));
    await waitFor(() => expect(screen.getByText("River study")).toBeTruthy());
    fireEvent.click(screen.getByTestId("button-download-account-backups"));

    await waitFor(() => expect(mocks.export).toHaveBeenCalledWith(expect.objectContaining({
      headers: { "X-Project-Session": "session_a" },
    })));
    await waitFor(() => expect(screen.getByTestId("account-backup-message").textContent).toMatch(/archive was downloaded/i));
    expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:account-backups"));

    mocks.export.mockRejectedValueOnce(new Error("download interrupted"));
    fireEvent.click(screen.getByTestId("button-download-account-backups"));
    await waitFor(() => expect(screen.getByTestId("account-backup-error").textContent).toMatch(/could not be downloaded/i));

    click.mockRestore();
    vi.unstubAllGlobals();
    view.unmount();
  });
});
