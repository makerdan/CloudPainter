import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { AccountControls } from "./Account";

const mocks = vi.hoisted(() => ({
  auth: { isLoaded: true, isSignedIn: true, sessionId: "admin-session", userId: "user_admin123" },
  overview: { data: { totalAccounts: 12 }, error: null, isLoading: false, isSuccess: true },
}));

vi.mock("@clerk/react", () => ({
  ClerkProvider: ({ children }: { children: unknown }) => children,
  SignIn: () => null,
  SignUp: () => null,
  useAuth: () => mocks.auth,
  useUser: () => ({ user: { firstName: "Admin" } }),
  useClerk: () => ({ signOut: vi.fn() }),
}));
vi.mock("@clerk/react/internal", () => ({ publishableKeyFromHost: () => "pk_test_example" }));
vi.mock("@clerk/themes", () => ({ shadcn: {} }));
vi.mock("wouter", async () => {
  const React = await import("react");
  return {
    Link: ({ href, children, ...props }: { href: string; children: unknown; [key: string]: unknown }) =>
      React.createElement("a", { ...props, href }, children),
    useLocation: () => ["/", vi.fn()],
  };
});
vi.mock("./tooltip-button", () => ({
  TooltipButton: ({ children, ...props }: { children: unknown; [key: string]: unknown }) =>
    <button {...props}>{children as ReactNode}</button>,
}));
vi.mock("@workspace/api-client-react", () => ({
  getGetAdminOverviewQueryKey: () => ["/api/admin/overview"],
  getListAdminAccountsQueryKey: () => ["/api/admin/accounts"],
  useGetAdminOverview: () => mocks.overview,
  useListAdminAccounts: () => ({ data: undefined, error: null, isLoading: false, isFetching: false, refetch: vi.fn() }),
  useSetAdminAccountStatus: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}));

describe("CloudPainter admin navigation visibility", () => {
  afterEach(() => cleanup());

  it("shows the admin console link only after the server authorizes the signed-in account", () => {
    mocks.auth.isLoaded = true;
    mocks.auth.isSignedIn = true;
    mocks.overview.isSuccess = true;
    const authorized = render(<AccountControls />);
    expect(screen.getByTestId("link-admin-console").getAttribute("href")).toBe("/admin");
    authorized.unmount();

    mocks.overview.isSuccess = false;
    mocks.overview.error = { status: 404 };
    render(<AccountControls />);
    expect(screen.queryByTestId("link-admin-console")).toBeNull();
  });
});
