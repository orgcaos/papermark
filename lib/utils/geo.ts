import { Geo } from "../types";

export function getGeoData(headers: {
  [key: string]: string | string[] | undefined;
}): Geo {
  return {
    city: Array.isArray(headers["x-vercel-ip-city"])
      ? headers["x-vercel-ip-city"][0]
      : headers["x-vercel-ip-city"],
    region: Array.isArray(headers["x-vercel-ip-region"])
      ? headers["x-vercel-ip-region"][0]
      : headers["x-vercel-ip-region"],
    country: Array.isArray(headers["x-vercel-ip-country"])
      ? headers["x-vercel-ip-country"][0]
      : headers["x-vercel-ip-country"],
    latitude: Array.isArray(headers["x-vercel-ip-latitude"])
      ? headers["x-vercel-ip-latitude"][0]
      : headers["x-vercel-ip-latitude"],
    longitude: Array.isArray(headers["x-vercel-ip-longitude"])
      ? headers["x-vercel-ip-longitude"][0]
      : headers["x-vercel-ip-longitude"],
  };
}

export const LOCALHOST_GEO_DATA = {
  continent: "Europe",
  city: "Munich",
  region: "BY",
  country: "DE",
  latitude: "48.1371",
  longitude: "11.5761",
};

export const LOCALHOST_IP = "127.0.0.1";

export const UNKNOWN_GEO_DATA = {
  continent: undefined as string | undefined,
  city: "Unknown",
  region: "Unknown",
  country: "Unknown",
  latitude: "Unknown",
  longitude: "Unknown",
};

function isPrivateOrLoopbackIp(ip: string): boolean {
  if (!ip) return true;
  if (ip === "127.0.0.1" || ip === "::1" || ip === "localhost") return true;
  // IPv4 private ranges: 10.x, 172.16-31.x, 192.168.x
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  const match172 = ip.match(/^172\.(\d+)\./);
  if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31)
    return true;
  return false;
}

/**
 * Self-hosted replacement for Vercel's edge geolocation. Vercel injects
 * x-vercel-ip-* headers at its CDN edge, which don't exist on a plain VPS
 * deploy -- this looks up the same information from the visitor's real IP
 * via ip-api.com's free, no-signup JSON endpoint instead.
 *
 * Free tier is rate-limited (45 req/min per server IP) and HTTP-only, which
 * is fine for a server-to-server call with no browser involved. Any failure
 * (timeout, rate limit, private/loopback IP) degrades to "Unknown" fields --
 * never to a fake location.
 */
export async function lookupGeoFromIp(ip: string): Promise<{
  continent?: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
}> {
  if (isPrivateOrLoopbackIp(ip)) {
    return UNKNOWN_GEO_DATA;
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,continent,country,countryCode,regionName,city,lat,lon`,
      { signal: AbortSignal.timeout(2500) },
    );

    if (!response.ok) {
      throw new Error(`ip-api responded with ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== "success") {
      return UNKNOWN_GEO_DATA;
    }

    return {
      continent: data.continent || undefined,
      city: data.city || "Unknown",
      region: data.regionName || "Unknown",
      // Match Vercel's 2-letter country code format (e.g. "DE", "EE").
      country: data.countryCode || "Unknown",
      latitude: data.lat != null ? String(data.lat) : "Unknown",
      longitude: data.lon != null ? String(data.lon) : "Unknown",
    };
  } catch (error) {
    console.error("[geo] ip-api lookup failed, using Unknown", error);
    return UNKNOWN_GEO_DATA;
  }
}
