const guardedApiPrefixes = [
  '/api/images',
  '/api/outlines',
  '/api/logo-images',
];

export function isProviderCapableApiRequest(url) {
  const pathname = new URL(url).pathname.replace(/\/+$/, '');
  return guardedApiPrefixes.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function createProviderRequestGuard(attempts) {
  return async (route) => {
    const url = new URL(route.request().url());
    attempts.push(url.pathname);
    await route.abort('blockedbyclient');
  };
}

export async function installProviderRequestGuard(context) {
  const attempts = [];
  await context.route(
    (url) => isProviderCapableApiRequest(url.toString()),
    createProviderRequestGuard(attempts),
  );
  return () => assertNoProviderRequestsEscaped(attempts);
}

export function assertNoProviderRequestsEscaped(attempts) {
  if (attempts.length > 0) {
    throw new Error(
      `Provider-capable API request had no local fixture; blocked before dispatch: ${attempts.join(', ')}`,
    );
  }
}
