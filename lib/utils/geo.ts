import { Geo } from "../types";
import { lookupGeoFromMaxmind } from "./maxmind-geo";

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
 * against a local GeoLite2 City database (via lib/utils/maxmind-geo.ts)
 * instead. The visitor's IP never leaves this server: no third-party
 * geolocation API is involved.
 *
 * The database file itself isn't part of this repo -- it's downloaded and
 * kept current on the server by MaxMind's official `geoipupdate` tool (see
 * the deploy notes for setup). Any failure (database not downloaded yet,
 * IP not found, private/loopback IP) degrades to "Unknown" fields -- never
 * to a fake location.
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

  const result = await lookupGeoFromMaxmind(ip);
  return result ?? UNKNOWN_GEO_DATA;
}
