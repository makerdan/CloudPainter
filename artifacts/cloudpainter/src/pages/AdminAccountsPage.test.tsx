import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminAccountsPage from "./AdminAccountsPage";

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, sessionId: "session-admin", userId: "user_admin123" },
  overview: { data: { totalAccounts: 26 }, error: null, isLoading: false, refetch: vi.fn() },
  page: {
    data: {
      totalCount: 26,
      limit: 25,
      offset: 0,
      accounts: [
        { id: "user_target123456", name: "River Stone", email: "river@example.test", createdAt: "2024-01-02T00:00:00.000Z", status: "active", generationAccess: { role: "normal", enabled: false } },
        { id: "user_admin123", name: "Admin User", email: "admin@example.test", createdAt: "2024-01-01T00:00:00.000Z", status: "active", generationAccess: { role: "normal", enabled: true } },
      ],
    },
    error: null,
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
    refetch: vi.fn(),
  },
  auditPage: {
    data: {
      totalCount: 26,
      limit: 25,
      nextCursor: "cursor-next",
      events: [
        { actorId: "user_admin123", targetId: "user_target123456", action: "suspend", outcome: "succeeded", createdAt: "2024-01-02T12:30:00.000Z" },
        { actorId: "user_other456", targetId: "user_target987654", action: "reactivate", outcome: "failed", createdAt: "2024-01-01T12:30:00.000Z" },
      ],
    },
    error: null,
    isLoading: false,
    isFetching: false,
    isFetchedAfterMount: true,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  generationMutate: vi.fn(),
  queryClient: { removeQueries: vi.fn(), invalidateQueries: vi.fn() },
  listHook: vi.fn(),
  overviewHook: vi.fn(),
  auditHook: vi.fn(),
  mutationHook: vi.fn(),
  generationMutationHook: vi.fn(),
}));

vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@tanstack/react-query", async importOriginal => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => mocks.queryClient };
});
vi.mock("@workspace/api-client-react", () => ({
  getGetAdminOverviewQueryKey: () => ["/api/admin/overview"],
  getListAdminAccountsQueryKey: () => ["/api/admin/accounts"],
  getListAdminAuditEventsQueryKey: () => ["/api/admin/audit-events"],
  useGetAdminOverview: (...args: unknown[]) => {
    mocks.overviewHook(...args);
    return mocks.overview;
  },
  useListAdminAccounts: (...args: unknown[]) => {
    mocks.listHook(...args);
    return mocks.page;
  },
  useListAdminAuditEvents: (...args: unknown[]) => {
    mocks.auditHook(...args);
    return mocks.auditPage;
  },
  useSetAdminAccountStatus: (...args: unknown[]) => {
    mocks.mutationHook(...args);
    return { mutate: mocks.mutate, isPending: false, isError: false };
  },
  useSetAdminGenerationAccess: (...args: unknown[]) => {
    mocks.generationMutationHook(...args);
    return { mutate: mocks.generationMutate, isPending: false, isError: false };
  },
}));

describe("CloudPainter admin account console", () => {
  beforeEach(() => {
    mocks.auth = { isLoaded: true, isSignedIn: true, sessionId: "session-admin", userId: "user_admin123" };
    mocks.overview = { data: { totalAccounts: 26 }, error: null, isLoading: false, refetch: vi.fn() };
    mocks.page = {
      data: {
        totalCount: 26,
        limit: 25,
        offset: 0,
        accounts: [
          { id: "user_target123456", name: "River Stone", email: "river@example.test", createdAt: "2024-01-02T00:00:00.000Z", status: "active", generationAccess: { role: "normal", enabled: false } },
          { id: "user_admin123", name: "Admin User", email: "admin@example.test", createdAt: "2024-01-01T00:00:00.000Z", status: "active", generationAccess: { role: "normal", enabled: true } },
        ],
      },
      error: null,
      isLoading: false,
      isFetching: false,
      isFetchedAfterMount: true,
      refetch: vi.fn(),
    };
    mocks.auditPage = {
      data: {
        totalCount: 26,
        limit: 25,
        nextCursor: "cursor-next",
        events: [
          { actorId: "user_admin123", targetId: "user_target123456", action: "suspend", outcome: "succeeded", createdAt: "2024-01-02T12:30:00.000Z" },
          { actorId: "user_other456", targetId: "user_target987654", action: "reactivate", outcome: "failed", createdAt: "2024-01-01T12:30:00.000Z" },
        ],
      },
      error: null,
      isLoading: false,
      isFetching: false,
      isFetchedAfterMount: true,
      refetch: vi.fn(),
    };
    mocks.mutate.mockReset();
    mocks.generationMutate.mockReset();
    mocks.queryClient.removeQueries.mockReset();
    mocks.queryClient.invalidateQueries.mockReset();
    mocks.listHook.mockReset();
    mocks.overviewHook.mockReset();
    mocks.auditHook.mockReset();
    mocks.mutationHook.mockReset();
    mocks.generationMutationHook.mockReset();
  });
  afterEach(() => cleanup());

  it("shows bounded account data, prevents self-suspension, and paginates server-side", () => {
    render(<AdminAccountsPage />);
    const overviewOptions = mocks.overviewHook.mock.calls[0]?.[0] as { request?: RequestInit };
    const listOptions = mocks.listHook.mock.calls[0]?.[1] as { request?: RequestInit };
    const mutationOptions = mocks.mutationHook.mock.calls[0]?.[0] as { request?: RequestInit };
    const generationMutationOptions = mocks.generationMutationHook.mock.calls[0]?.[0] as { request?: RequestInit };
    const auditOptions = mocks.auditHook.mock.calls[0]?.[1] as { request?: RequestInit };
    for (const options of [overviewOptions, listOptions, auditOptions, mutationOptions, generationMutationOptions]) {
      expect(options.request?.headers).toEqual({ "X-Admin-Session": "session-admin" });
      expect(options.request?.credentials).toBe("same-origin");
    }
    expect(screen.getByTestId("text-total-accounts").textContent).toContain("26");
    expect(screen.getByTestId("text-account-email-user_target123456").textContent).toBe("river@example.test");
    expect(screen.getByTestId("status-account-user_target123456").textContent).toContain("Active");
    expect(screen.getByTestId("status-generation-access-user_target123456").textContent).toContain("Revoked");
    expect(screen.getByText("Current admin")).toBeTruthy();
    expect(screen.queryByTestId("button-suspend-user_admin123")).toBeNull();
    expect(screen.getByText("Account status history")).toBeTruthy();
    expect(screen.getByText("user_admin123")).toBeTruthy();
    expect(screen.getByText("user_target123456")).toBeTruthy();
    expect(screen.getByText("succeeded")).toBeTruthy();
    expect(screen.getByTestId("text-audit-pagination-range").textContent).toContain("26");

    fireEvent.change(screen.getByTestId("input-account-search"), { target: { value: "river" } });
    fireEvent.click(screen.getByTestId("button-search"));
    expect(mocks.listHook.mock.calls.some(([params]) => (params as { query?: string }).query === "river")).toBe(true);
    fireEvent.click(screen.getByTestId("button-next-page"));
    expect(mocks.listHook.mock.calls.some(([params]) => (params as { offset?: number }).offset === 25)).toBe(true);
    fireEvent.click(screen.getByTestId("button-audit-next-page"));
    expect(mocks.auditHook.mock.calls.some(([params]) => (params as { cursor?: string }).cursor === "cursor-next")).toBe(true);
    fireEvent.click(screen.getByTestId("button-audit-previous-page"));
    expect(mocks.auditHook.mock.calls.some(([params]) => (params as { cursor?: string }).cursor === undefined)).toBe(true);
  });

  it("filters status history by action and outcome and resets cursor paging", () => {
    render(<AdminAccountsPage />);
    fireEvent.click(screen.getByTestId("button-audit-next-page"));
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({ limit: 25, cursor: "cursor-next" });

    fireEvent.change(screen.getByTestId("select-audit-action"), { target: { value: "suspend" } });
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({ limit: 25, action: "suspend" });
    fireEvent.change(screen.getByTestId("select-audit-outcome"), { target: { value: "failed" } });
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({ limit: 25, action: "suspend", outcome: "failed" });
    fireEvent.click(screen.getByTestId("button-audit-next-page"));
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({
      limit: 25,
      cursor: "cursor-next",
      action: "suspend",
      outcome: "failed",
    });

    fireEvent.change(screen.getByTestId("select-audit-action"), { target: { value: "" } });
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({ limit: 25, outcome: "failed" });
    fireEvent.change(screen.getByTestId("select-audit-outcome"), { target: { value: "" } });
    expect(mocks.auditHook.mock.calls.at(-1)?.[0]).toEqual({ limit: 25 });
  });

  it("requires explicit confirmation before changing status", () => {
    render(<AdminAccountsPage />);
    fireEvent.click(screen.getByTestId("button-suspend-user_target123456"));
    expect(screen.getByRole("dialog").textContent).toContain("Suspend this account?");
    fireEvent.click(screen.getByTestId("button-cancel-confirmation"));
    expect(mocks.mutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-suspend-user_target123456"));
    fireEvent.click(screen.getByTestId("button-confirm-status-change"));
    expect(mocks.mutate).toHaveBeenCalledWith(
      { userId: "user_target123456", data: { status: "suspended" } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("confirms access approval and role changes without clearing a revoked state", () => {
    render(<AdminAccountsPage />);
    fireEvent.click(screen.getByTestId("button-approve-generation-access-user_target123456"));
    expect(screen.getByRole("dialog").textContent).toContain("Approve generation access?");
    fireEvent.click(screen.getByTestId("button-cancel-generation-confirmation"));
    expect(mocks.generationMutate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-approve-generation-access-user_target123456"));
    fireEvent.click(screen.getByTestId("button-confirm-generation-change"));
    expect(mocks.generationMutate).toHaveBeenCalledWith(
      { userId: "user_target123456", data: { role: "normal", enabled: true } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );

    fireEvent.change(screen.getByTestId("select-generation-role-user_target123456"), { target: { value: "admin" } });
    fireEvent.click(screen.getByTestId("button-save-generation-role-user_target123456"));
    expect(screen.getByRole("dialog").textContent).toContain("Change generation allowance?");
    fireEvent.click(screen.getByTestId("button-confirm-generation-change"));
    expect(mocks.generationMutate).toHaveBeenLastCalledWith(
      { userId: "user_target123456", data: { role: "admin", enabled: false } },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("uses the not-found screen for signed-out and server-denied visits", () => {
    mocks.auth.isSignedIn = false;
    const signedOut = render(<AdminAccountsPage />);
    expect(screen.getByText("404 Page Not Found")).toBeTruthy();
    signedOut.unmount();

    mocks.auth.isSignedIn = true;
    mocks.page.error = { status: 404 };
    render(<AdminAccountsPage />);
    expect(screen.getByText("404 Page Not Found")).toBeTruthy();
    expect(screen.queryByText("River Stone")).toBeNull();
  });

  it("hides cached account history when the server denies the current session", () => {
    mocks.auditPage.error = { status: 404 };
    render(<AdminAccountsPage />);
    expect(screen.getByText("404 Page Not Found")).toBeTruthy();
    expect(screen.queryByText("Account status history")).toBeNull();
    expect(screen.queryByText("user_target123456")).toBeNull();
  });
});
