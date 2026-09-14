import { NextApiRequest, NextApiResponse } from "next";

import { GetObjectCommand } from "@aws-sdk/client-s3";
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

    const object = await client.send(
      new GetObjectCommand({ Bucket: config.bucket, Key: thumbnailSource.file }),
    );

    res.setHeader("Content-Type", object.ContentType || "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (object.Body instanceof Readable) {
      object.Body.pipe(res);
    } else {
      // Fallback for environments where Body isn't already a Node Readable.
      const bytes = await object.Body?.transformToByteArray();
      res.status(200).end(bytes ? Buffer.from(bytes) : undefined);
    }
  } catch (error) {
    console.error("public thumbnail error", error);
    res.status(500).json({ message: "Failed to load thumbnail" });
  }
}
