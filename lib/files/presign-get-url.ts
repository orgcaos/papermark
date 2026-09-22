import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl as getCloudfrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";

import { ONE_HOUR, ONE_MINUTE, ONE_SECOND, TWO_MINUTES } from "@/lib/constants";
import { getTeamS3ClientAndConfig } from "@/lib/files/aws-client";

// SERVER ONLY. Signs a GET URL for an S3/R2 object key in-process.
//
// This is the logic that used to live only inside
// pages/api/file/s3/get-presigned-get-url.ts. Server-side callers
// (app/api/views, /api/views/pages, sign-page-links) used to reach it by
// POSTing to that endpoint on the app's own public domain - one full
// HTTPS round-trip through Caddy per page URL, plus a feature-flag DB lookup
// inside the endpoint each time - which is where most of the ~250-900ms
// "get-pages" time on every document open went (10 pages = 10 round-trips).
// Signing is ~1ms of local CPU; there was never a reason to leave the process
// for it. The HTTP endpoint still exists (it now just calls this) for the
// client-side proxy and for the other server-side `getFile()` call sites
// that haven't been switched to get-file-server.ts yet.

type TeamClient = Awaited<ReturnType<typeof getTeamS3ClientAndConfig>>;

// The team -> storage config resolution hits the DB (feature flags) and
// constructs a fresh S3Client each time. Neither changes from one page to
// the next, so keep it for a minute. Keyed by teamId; single-tenant here
// anyway, so this is effectively one entry.
const TEAM_CLIENT_TTL = ONE_MINUTE;
const teamClientCache = new Map<
  string,
  { value: Promise<TeamClient>; expiresAt: number }
>();

async function getCachedTeamS3Client(teamId: string): Promise<TeamClient> {
  const now = Date.now();
  const cached = teamClientCache.get(teamId);
  if (cached && cached.expiresAt > now) return cached.value;

  const value = getTeamS3ClientAndConfig(teamId);
  teamClientCache.set(teamId, { value, expiresAt: now + TEAM_CLIENT_TTL });
  // Don't keep a rejected promise around for a minute.
  value.catch(() => teamClientCache.delete(teamId));
  return value;
}

export type PresignGetUrlOptions = {
  /** Object key, `teamId/docId/filename` */
  key: string;
  /** Lifetime in milliseconds; defaults to 2 minutes, capped at 1 hour. */
  expiresIn?: number;
  responseContentDisposition?: string;
};

export async function presignGetUrl({
  key,
  expiresIn: requestedExpiresIn,
  responseContentDisposition,
}: PresignGetUrlOptions): Promise<string> {
  const expiration = Math.min(requestedExpiresIn || TWO_MINUTES, ONE_HOUR);

  // Extract teamId from key (format: teamId/docId/filename)
  const teamId = key.split("/")[0];
  if (!teamId) {
    throw new Error(`Invalid key format: ${key}`);
  }

  const { client, config } = await getCachedTeamS3Client(teamId);

  if (config.distributionHost) {
    const distributionUrl = new URL(key, `https://${config.distributionHost}`);

    if (!responseContentDisposition) {
      return getCloudfrontSignedUrl({
        url: distributionUrl.toString(),
        keyPairId: `${config.distributionKeyId}`,
        privateKey: `${config.distributionKeyContents}`,
        dateLessThan: new Date(Date.now() + expiration).toISOString(),
      });
    }

    // Use a custom policy (wildcard resource) when overriding
    // Content-Disposition. The RFC 5987 `filename*=UTF-8''...` syntax
    // contains `''`, which the canned-policy path can't sign correctly:
    // the signer leaves `'` literal (encodeURIComponent), but browsers
    // re-encode it to `%27` on send, so the URL no longer matches what
    // was signed and CloudFront returns AccessDenied. Signing the
    // Policy JSON instead of the URL bytes sidesteps the mismatch.
    distributionUrl.searchParams.set(
      "response-content-disposition",
      responseContentDisposition,
    );

    const resourceBase = `https://${config.distributionHost}${distributionUrl.pathname}`;
    const policy = JSON.stringify({
      Statement: [
        {
          Resource: `${resourceBase}?*`,
          Condition: {
            DateLessThan: {
              "AWS:EpochTime": Math.floor(
                (Date.now() + expiration) / ONE_SECOND,
              ),
            },
          },
        },
      ],
    });

    return getCloudfrontSignedUrl({
      url: distributionUrl.toString(),
      policy,
      keyPairId: `${config.distributionKeyId}`,
      privateKey: `${config.distributionKeyContents}`,
    });
  }

  const getObjectCommand = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ...(responseContentDisposition
      ? { ResponseContentDisposition: responseContentDisposition }
      : {}),
  });

  return getS3SignedUrl(client as S3Client, getObjectCommand, {
    expiresIn: expiration / ONE_SECOND,
  });
}
