import { NextApiRequest, NextApiResponse } from "next";

import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { DocumentStorageType } from "@prisma/client";
import { Readable } from "stream";

import { getTeamS3ClientAndConfig } from "@/lib/files/aws-client";
import prisma from "@/lib/prisma";
import { ratelimit } from "@/lib/redis";
import { getIpAddress } from "@/lib/utils/ip";

// Public, unauthenticated endpoint: serves a document's first-page image so
// it can be hotlinked from anywhere that can't send our session cookie or
// carry a short-lived signed URL — email clients (Gmail, Apple Mail, etc.)
// rendering the "copy formatted" share card, chat unfurls, and similar.
//
// Trust model: exposes only a low-res first-page preview, gated by knowledge
// of the document's cuid (effectively unguessable, never enumerable, and
// only ever handed out via a share-link flow the document owner initiated).
// This is the same practical exposure level as the existing metaImage/OG
// social-preview mechanism, just automatic instead of requiring the owner to
// configure custom link branding first.
// Width of the cached preview rendition. 1280px covers the largest place it
// is displayed (the viewer loading cover on a laptop) at 1x and reads fine
// at 2x for the small documents-list / email-card thumbnails.
const PREVIEW_WIDTH = 1280;

function getPreviewKey(originalKey: string): string {
  return originalKey.replace(/\.[a-z0-9]+$/i, "") + ".preview.jpeg";
}

function isNotFound(err: unknown): boolean {
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
  return (
    e?.name === "NoSuchKey" ||
    e?.name === "NotFound" ||
    e?.$metadata?.httpStatusCode === 404
  );
}

async function makePreview(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  return sharp(input)
    .resize({ width: PREVIEW_WIDTH, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true, progressive: true })
    .toBuffer();
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  // Wide open deliberately, same reasoning as the endpoint's own doc
  // comment above ("can be hotlinked from anywhere") and the same pattern
  // orgcaos-hubspot's own public /api/templates route uses: this is a
  // public, unauthenticated, unguessable-ID-gated endpoint, so there's no
  // origin to meaningfully restrict to. Needed for callers that `fetch()`
  // this cross-origin (rather than just using it as an <img src>, which
  // never needed CORS) to inline the bytes themselves — e.g. the Email
  // Cards feature in orgcaos-hubspot fetching this to embed the thumbnail
  // as a base64 data: URI in a copied email card, since Apple Mail blocks
  // hotlinked <img> content by default.
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const { documentId } = req.query as { documentId: string };

  const ip = getIpAddress(req.headers);
  const { success } = await ratelimit(120, "1 m").limit(
    `public-thumbnail:${ip}`,
  );
  if (!success) {
    res.status(429).json({ message: "Too many requests" });
    return;
  }

  try {
    const document = await prisma.document.findUnique({
      where: { id: documentId },
      select: { teamId: true },
    });

    if (!document) {
      res.status(404).end();
      return;
    }

    const primaryVersion = await prisma.documentVersion.findFirst({
      where: { documentId, isPrimary: true },
      select: {
        id: true,
        hasPages: true,
        type: true,
        file: true,
        storageType: true,
      },
      orderBy: { versionNumber: "desc" },
    });

    if (!primaryVersion) {
      res.status(404).end();
      return;
    }

    // Two shapes of "first page image" depending on document type:
    // - PDFs and anything converted to pages (docs, slides): a real
    //   DocumentPage row exists per page, pageNumber 1 is the thumbnail.
    // - Raw image uploads (jpg/png/etc.) never get paginated — the image
    //   IS the document, stored directly on the version record. Matches
    //   the same branching preview-data.ts uses to serve these two cases.
    let thumbnailSource: { file: string; storageType: DocumentStorageType } | null =
      null;

    if (primaryVersion.hasPages) {
      const firstPage = await prisma.documentPage.findUnique({
        where: {
          pageNumber_versionId: { pageNumber: 1, versionId: primaryVersion.id },
        },
        select: { file: true, storageType: true },
      });
      if (firstPage) {
        thumbnailSource = firstPage;
      }
    } else if (primaryVersion.type === "image") {
      thumbnailSource = {
        file: primaryVersion.file,
        storageType: primaryVersion.storageType,
      };
    }

    if (!thumbnailSource) {
      // Video, sheet, html, notion, etc. — no static image representation
      // to serve here yet. The email card will just show a broken image
      // for these types for now.
      res.status(404).end();
      return;
    }

    if (thumbnailSource.storageType === DocumentStorageType.VERCEL_BLOB) {
      // Vercel Blob URLs are already public and stable — just redirect.
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.redirect(302, thumbnailSource.file);
      return;
    }

    // S3_PATH (Cloudflare R2 in this deployment): fetch the object
    // server-side with our own credentials and stream it back, rather than
    // handing out a presigned URL — presigned URLs here are capped at 1
    // hour, which isn't nearly long-lived enough for an image sitting in
    // someone's inbox for weeks.
    const { client, config } = await getTeamS3ClientAndConfig(
      document.teamId,
    );

    // Serve a downsized "preview" rendition rather than the full page image.
    // The stored page-1 render is ~3840px wide / ~0.9MB (it's the same file
    // the viewer zooms into); every consumer of this endpoint - the viewer's
    // loading cover, the documents list, the email card - shows it at
    // <=1400px, and for a cold recipient this is the very first image on
    // screen, so 0.9MB through Node was the wrong thing to make them wait
    // for. The rendition is generated once with sharp (~100KB JPEG), stored
    // in R2 next to the original under a `.preview.jpeg` suffix, and served
    // from there on every later request. Any failure in the resize path
    // (sharp missing, odd input) falls back to streaming the original, so
    // this can only ever be as slow as before, never broken.
    const previewKey = getPreviewKey(thumbnailSource.file);

    let body: Readable | Uint8Array | undefined;
    let contentType = "image/jpeg";

    try {
      const cached = await client.send(
        new GetObjectCommand({ Bucket: config.bucket, Key: previewKey }),
      );
      body = cached.Body as Readable | undefined;
    } catch (err) {
      if (!isNotFound(err)) throw err;

      const original = await client.send(
        new GetObjectCommand({
          Bucket: config.bucket,
          Key: thumbnailSource.file,
        }),
      );
      const originalBytes = await original.Body!.transformToByteArray();

      try {
        const preview = await makePreview(Buffer.from(originalBytes));
        // Best effort: if the write fails we still serve the resized bytes
        // this time and simply regenerate next time.
        client
          .send(
            new PutObjectCommand({
              Bucket: config.bucket,
              Key: previewKey,
              Body: preview,
              ContentType: "image/jpeg",
            }),
          )
          .catch((e) =>
            console.warn("[public thumbnail] preview cache write failed", e),
          );
        body = preview;
      } catch (e) {
        console.warn(
          "[public thumbnail] preview generation failed, serving original",
          e,
        );
        body = originalBytes;
        contentType = original.ContentType || "image/jpeg";
      }
    }

    res.setHeader("Content-Type", contentType);
    // The URL is keyed by document id, not version, so a new upload changes
    // what this should return - a day of caching is plenty for the loading
    // cover and documents list, without pinning a stale first page forever.
    res.setHeader(
      "Cache-Control",
      "public, max-age=86400, stale-while-revalidate=604800",
    );

    if (body instanceof Readable) {
      body.pipe(res);
    } else {
      res.status(200).end(body ? Buffer.from(body) : undefined);
    }
  } catch (error) {
    console.error("public thumbnail error", error);
    res.status(500).json({ message: "Failed to load thumbnail" });
  }
}
