import { Reader, ReaderModel } from "@maxmind/geoip2-node";

// Default DatabaseDirectory used by MaxMind's official `geoipupdate` tool
// when none is set in /etc/GeoIP.conf, plus the standard filename for the
// GeoLite2 City edition. Override with MAXMIND_DB_PATH if the database lives
// somewhere else on this server.
const DEFAULT_DB_PATH = "/var/lib/GeoIP/GeoLite2-City.mmdb";

let readerPromise: Promise<ReaderModel | null> | null = null;
let hasWarnedMissing = false;

function loadReader(): Promise<ReaderModel | null> {
  if (!readerPromise) {
    const dbPath = process.env.MAXMIND_DB_PATH || DEFAULT_DB_PATH;
    readerPromise = Reader.open(dbPath).catch((error) => {
      if (!hasWarnedMissing) {
        hasWarnedMissing = true;
        console.error(
          `[geo] Could not open the MaxMind database at ${dbPath} -- ` +
            "location lookups will return Unknown until geoipupdate has " +
            "downloaded it on this server. See lib/utils/maxmind-geo.ts.",
          error,
        );
      }
      return null;
    });
  }
  return readerPromise;
}

export interface MaxmindGeoResult {
  continent?: string;
  city: string;
  region: string;
  country: string;
  latitude: string;
  longitude: string;
}

/**
 * Looks up a visitor's location from a local GeoLite2 City database via
 * MaxMind's official reader library -- no network call, no third party ever
 * sees the IP. Returns null (never throws) when the database isn't
 * available yet, or the IP isn't found in it (e.g. some reserved ranges).
 */
export async function lookupGeoFromMaxmind(
  ip: string,
): Promise<MaxmindGeoResult | null> {
  const reader = await loadReader();
  if (!reader) return null;

  try {
    const response = reader.city(ip);
    return {
      continent: response.continent?.names?.en,
      city: response.city?.names?.en || "Unknown",
      region: response.subdivisions?.[0]?.isoCode || "Unknown",
      country: response.country?.isoCode || "Unknown",
      latitude:
        response.location?.latitude != null
          ? String(response.location.latitude)
          : "Unknown",
      longitude:
        response.location?.longitude != null
          ? String(response.location.longitude)
          : "Unknown",
    };
  } catch {
    // AddressNotFoundError and friends -- the IP just isn't in the database
    // (some reserved/edge ranges never are). Not worth logging per-request.
    return null;
  }
}
