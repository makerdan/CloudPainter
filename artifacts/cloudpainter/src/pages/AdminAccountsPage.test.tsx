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
        { id: "user_target123456", name: "River Stone", email: "river@example.test", createdAt: "2024-01-02T00:00:00.000Z", status: "active" },
        { id: "user_admin123", name: "Admin User", email: "admin@example.test", createdAt: "2024-01-01T00:00:00.000Z", status: "active" },
      ],
    },
    error: null,
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
  queryClient: { removeQueries: vi.fn(), invalidateQueries: vi.fn() },
  listHook: vi.fn(),
  overviewHook: vi.fn(),
  mutationHook: vi.fn(),
}));

vi.mock("@clerk/react", () => ({ useAuth: () => mocks.auth }));
vi.mock("@tanstack/react-query", async importOriginal => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return { ...actual, useQueryClient: () => mocks.queryClient };
});
vi.mock("@workspace/api-client-react", () => ({
  getGetAdminOverviewQueryKey: () => ["/api/admin/overview"],
  getListAdminAccountsQueryKey: () => ["/api/admin/accounts"],
  useGetAdminOverview: (...args: unknown[]) => {
    mocks.overviewHook(...args);
    return mocks.overview;
  },
  useListAdminAccounts: (...args: unknown[]) => {
    mocks.listHook(...args);
    return mocks.page;
  },
  useSetAdminAccountStatus: (...args: unknown[]) => {
    mocks.mutationHook(...args);
    return { mutate: mocks.mutate, isPending: false, isError: false };
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
          { id: "user_target123456", name: "River Stone", email: "river@example.test", createdAt: "2024-01-02T00:00:00.000Z", status: "active" },
          { id: "user_admin123", name: "Admin User", email: "admin@example.test", createdAt: "2024-01-01T00:00:00.000Z", status: "active" },
        ],
      },
      error: null,
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    };
    mocks.mutate.mockReset();
    mocks.queryClient.removeQueries.mockReset();
    mocks.queryClient.invalidateQueries.mockReset();
    mocks.listHook.mockReset();
    mocks.overviewHook.mockReset();
    mocks.mutationHook.mockReset();
  });
  afterEach(() => cleanup());

  it("shows bounded account data, prevents self-suspension, and paginates server-side", () => {
    render(<AdminAccountsPage />);
    const overviewOptions = mocks.overviewHook.mock.calls[0]?.[0] as { request?: RequestInit };
    const listOptions = mocks.listHook.mock.calls[0]?.[1] as { request?: RequestInit };
    const mutationOptions = mocks.mutationHook.mock.calls[0]?.[0] as { request?: RequestInit };
    for (const options of [overviewOptions, listOptions, mutationOptions]) {
      expect(options.request?.headers).toEqual({ "X-Admin-Session": "session-admin" });
      expect(options.request?.credentials).toBe("same-origin");
    }
    expect(screen.getByTestId("text-total-accounts").textContent).toContain("26");
    expect(screen.getByTestId("text-account-email-user_target123456").textContent).toBe("river@example.test");
    expect(screen.getByTestId("status-account-user_target123456").textContent).toContain("Active");
    expect(screen.getByText("Current admin")).toBeTruthy();
    expect(screen.queryByTestId("button-suspend-user_admin123")).toBeNull();

    fireEvent.change(screen.getByTestId("input-account-search"), { target: { value: "river" } });
    fireEvent.click(screen.getByTestId("button-search"));
    expect(mocks.listHook.mock.calls.some(([params]) => (params as { query?: string }).query === "river")).toBe(true);
    fireEvent.click(screen.getByTestId("button-next-page"));
    expect(mocks.listHook.mock.calls.some(([params]) => (params as { offset?: number }).offset === 25)).toBe(true);
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
});
