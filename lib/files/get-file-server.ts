import { DocumentStorageType } from "@prisma/client";
import { getDownloadUrl } from "@vercel/blob";
import { match } from "ts-pattern";

import type { GetFileOptions } from "@/lib/files/get-file";
import { presignGetUrl } from "@/lib/files/presign-get-url";

// SERVER ONLY drop-in for `getFile()` from ./get-file.
//
// Same options, same return value, but S3 keys are signed in-process (see
// presign-get-url.ts) instead of via an HTTPS call to our own
// /api/file/s3/get-presigned-get-url endpoint. `getFile()` itself has to
// stay isomorphic - it's imported by client components that go through the
// proxy route - so the S3 SDK / feature-flag imports live here instead,
// where only API routes can pull them in.
export const getFileServer = async ({
  type,
  data,
  isDownload = false,
  expiresIn,
  responseContentDisposition,
}: GetFileOptions): Promise<string> => {
  return match(type)
    .with(DocumentStorageType.VERCEL_BLOB, () =>
      isDownload ? getDownloadUrl(data) : data,
    )
    .with(DocumentStorageType.S3_PATH, () =>
      presignGetUrl({ key: data, expiresIn, responseContentDisposition }),
    )
    .exhaustive();
};
