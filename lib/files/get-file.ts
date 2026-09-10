import { DocumentStorageType } from "@prisma/client";
import { getDownloadUrl } from "@vercel/blob";
import { match } from "ts-pattern";

export type GetFileOptions = {
  type: DocumentStorageType;
  data: string;
  isDownload?: boolean;
  /** Signed URL lifetime in milliseconds (server-side S3 only, capped at 1 hour) */
  expiresIn?: number;
  /**
   * Override the Content-Disposition returned for this single download.
   * Only honored for S3-backed documents on origins that are not fronted by
   * CloudFront (CloudFront strips/ignores the override).
   */
  responseContentDisposition?: string;
};

export const getFile = async ({
  type,
  data,
  isDownload = false,
  expiresIn,
  responseContentDisposition,
}: GetFileOptions): Promise<string> => {
  const url = await match(type)
    .with(DocumentStorageType.VERCEL_BLOB, () => {
      if (isDownload) {
        return getDownloadUrl(data);
      } else {
        return data;
      }
    })
    .with(DocumentStorageType.S3_PATH, async () =>
      getFileFromS3(data, expiresIn, responseContentDisposition),
    )
    .exhaustive();

  return url;
};

const fetchPresignedUrl = async (
  endpoint: string,
  headers: Record<string, string>,
  key: string,
  expiresIn?: number,
  responseContentDisposition?: string,
): Promise<string> => {
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      key,
      ...(expiresIn && { expiresIn }),
      ...(responseContentDisposition && { responseContentDisposition }),
    }),
  });

  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    let errorMessage: string;

    if (contentType && contentType.includes("application/json")) {
      try {
        const error = await response.json();
        errorMessage =
          error.message || `Request failed with status ${response.status}`;
      } catch (parseError) {
        const textError = await response.text();
        errorMessage =
          textError || `Request failed with status ${response.status}`;
      }
    } else {
      const textError = await response.text();
      errorMessage =
        textError || `Request failed with status ${response.status}`;
    }

    throw new Error(errorMessage);
  }

  const { url } = (await response.json()) as { url: string };
  return url;
};

const getFileFromS3 = async (
  key: string,
  expiresIn?: number,
  responseContentDisposition?: string,
) => {
  // This must be decided purely by execution context, not by whether
  // INTERNAL_API_KEY happens to be configured: the "else" (proxy) branch
  // below calls a relative URL, which only resolves against the current
  // page origin in a browser. Every real call site for this function
  // (app/api/views/route.ts, trigger jobs, etc.) runs server-side, so
  // gating on the env var meant "not configured" silently turned into
  // "use the relative URL anyway", which always fails server-side with
  // "Failed to parse URL". If INTERNAL_API_KEY is genuinely missing, the
  // internal endpoint below already returns a clear 500 instead.
  const isServer = typeof window === "undefined";

  if (isServer) {
    return fetchPresignedUrl(
      `${process.env.NEXT_PUBLIC_BASE_URL}/api/file/s3/get-presigned-get-url`,
      {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
      },
      key,
      expiresIn,
      responseContentDisposition,
    );
  } else {
    return fetchPresignedUrl(
      `/api/file/s3/get-presigned-get-url-proxy`,
      {
        "Content-Type": "application/json",
      },
      key,
      undefined,
      responseContentDisposition,
    );
  }
};
