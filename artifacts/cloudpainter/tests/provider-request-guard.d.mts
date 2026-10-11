import type { BrowserContext, Page, Route } from '@playwright/test';

export function isProviderCapableApiRequest(url: string | URL): boolean;
export function createProviderRequestGuard(attempts: string[]): (route: Route) => Promise<void>;
export function installProviderRequestGuard(context: Pick<BrowserContext, 'route'> | Pick<Page, 'route'>): Promise<() => void>;
export function assertNoProviderRequestsEscaped(attempts: string[]): void;
