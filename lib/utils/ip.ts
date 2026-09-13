export function getIpAddress(headers: {
  [key: string]: string | string[] | undefined;
}): string {
  // Check x-forwarded-for header (most common for proxied requests)
  const forwardedFor = headers["x-forwarded-for"];
  if (typeof forwardedFor === "string") {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }
  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const ip = forwardedFor[0].split(",")[0]?.trim();
    if (ip) return ip;
  }

  // Check x-real-ip header (nginx proxy)
  const realIp = headers["x-real-ip"];
  if (typeof realIp === "string") {
    const ip = realIp.trim();
    if (ip) return ip;
  }
  if (Array.isArray(realIp) && realIp.length > 0) {
    const ip = realIp[0].trim();
    if (ip) return ip;
  }

  // Fallback to localhost
  return "127.0.0.1";
}

/**
 * Same extraction as getIpAddress, but for App Router request objects whose
 * headers are a Headers instance (`.get(name)`) rather than a plain object --
 * e.g. NextRequest in lib/tracking/record-link-view.ts.
 */
export function getIpAddressFromHeaderGetter(
  get: (name: string) => string | null,
): string {
  const forwardedFor = get("x-forwarded-for");
  if (forwardedFor) {
    const ip = forwardedFor.split(",")[0]?.trim();
    if (ip) return ip;
  }

  const realIp = get("x-real-ip");
  if (realIp) {
    const ip = realIp.trim();
    if (ip) return ip;
  }

  return "127.0.0.1";
}
