/** Managed listeners accept decimal integer ports only; never select a fallback. */
export function configuredPort(raw) {
  if (typeof raw !== "string" || !/^[0-9]{1,5}$/.test(raw)) {
    throw new Error("PORT must be a decimal integer in 1..65535.");
  }
  const port = Number(raw);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be a decimal integer in 1..65535.");
  }
  return port;
}
