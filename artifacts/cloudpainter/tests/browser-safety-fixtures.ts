import { expect, test as base } from '@playwright/test';
import {
  assertNoProviderRequestsEscaped,
  createProviderRequestGuard,
  isProviderCapableApiRequest,
} from './provider-request-guard.mjs';

export { expect };
export type { Browser, Download, Page } from '@playwright/test';

export const test = base.extend({
  page: async ({ page }, use) => {
    const unexpectedRequests: string[] = [];
    await page.route(
      (url) => isProviderCapableApiRequest(url.toString()),
      createProviderRequestGuard(unexpectedRequests),
    );

    await use(page);
    assertNoProviderRequestsEscaped(unexpectedRequests);
  },
});
