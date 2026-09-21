/**
 * Self-hosted PDF-to-page conversion.
 *
 * The upstream Papermark template hands this off to Trigger.dev because on
 * Vercel a request has a hard execution time limit, so the page-by-page
 * conversion can't happen inside the upload request itself. This deployment
 * runs on a single always-on Hetzner server via systemd with no such limit,
 * and Trigger.dev was never configured for it (no TRIGGER_SECRET_KEY) -
 * which meant every PDF upload failed outright with an
 * "ApiClientMissingError" the moment processDocument() tried to enqueue the
 * conversion job.
 *
 * Fix: run the same conversion steps directly in this process instead of
 * queueing them to an external job service we don't need. Called
 * fire-and-forget (not awaited) from processDocument() so the upload
 * request returns immediately while this continues in the background.
 *
 * Mirrors lib/trigger/pdf-to-image-route.ts's "standard path" (the
 * Trigger.dev task file is left in place, untouched, in case Trigger.dev is
 * ever configured for this deployment) - same two internal API calls
 * (/api/mupdf/get-pages, /api/mupdf/convert-page), same DB updates. Skips
 * that file's "large PDF direct conversion" branch, which only applies to
 * two hardcoded team IDs from the original template, not this deployment.
 */
import { ONE_HOUR } from "@/lib/constants";
import { isTrustedTeam } from "@/lib/edge-config/trusted-teams";
import { clearCachedPdf } from "@/lib/documents/pdf-cache";
import { getFile } from "@/lib/files/get-file";
import prisma from "@/lib/prisma";

type ProcessPdfInlinePayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
  versionNumber?: number;
};

const PAGE_CONVERT_MAX_ATTEMPTS = 3;
const PAGE_CONVERT_RETRY_DELAY_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function convertPageWithRetry(body: {
  documentVersionId: string;
  pageNumber: number;
  url: string;
  teamId: string;
  trustedTeam: boolean;
}) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PAGE_CONVERT_MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/mupdf/convert-page`,
        {
          method: "POST",
          body: JSON.stringify(body),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          },
        },
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Document was blocked by the keyword filter - don't retry, this
        // won't succeed on a second attempt.
        if (
          response.status === 400 &&
          typeof errorData.error === "string" &&
          errorData.error.includes("blocked")
        ) {
          console.error("[pdf-inline] document blocked", {
            pageNumber: body.pageNumber,
            matchedUrl: errorData.matchedUrl,
            matchedKeyword: errorData.matchedKeyword,
          });
          throw new Error("Document processing blocked");
        }

        throw new Error(
          `Failed to convert page ${body.pageNumber} (status: ${response.status})`,
        );
      }

      return true;
    } catch (error) {
      lastError = error;
      if (attempt < PAGE_CONVERT_MAX_ATTEMPTS) {
        await sleep(PAGE_CONVERT_RETRY_DELAY_MS * attempt);
      }
    }
  }

  console.error("[pdf-inline] failed to convert page after retries", {
    pageNumber: body.pageNumber,
    error: lastError,
  });
  return false;
}

export async function processPdfInline(payload: ProcessPdfInlinePayload) {
  const { documentId, documentVersionId, teamId, versionNumber } = payload;

  try {
    const documentVersion = await prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      select: { file: true, storageType: true, numPages: true },
    });

    if (!documentVersion) {
      console.error("[pdf-inline] document version not found", {
        documentVersionId,
      });
      return;
    }

    const signedUrl = await getFile({
      type: documentVersion.storageType,
      data: documentVersion.file,
      expiresIn: ONE_HOUR,
    });

    if (!signedUrl) {
      console.error("[pdf-inline] failed to get signed url", {
        documentVersionId,
      });
      return;
    }

    let numPages = documentVersion.numPages;

    if (!numPages || numPages === 1) {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_BASE_URL}/api/mupdf/get-pages`,
        {
          method: "POST",
          body: JSON.stringify({ url: signedUrl }),
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.INTERNAL_API_KEY}`,
          },
        },
      );

      if (!response.ok) {
        console.error("[pdf-inline] failed to get number of pages", {
          documentVersionId,
          status: response.status,
        });
        return;
      }

      const { numPages: numPagesResult } = (await response.json()) as {
        numPages: number;
      };

      if (numPagesResult < 1) {
        console.error("[pdf-inline] invalid page count", {
          documentVersionId,
        });
        return;
      }

      numPages = numPagesResult;
    }

    const trustedTeam = await isTrustedTeam(teamId);

    // Page 1 goes first on its own (it sets the document's orientation and
    // warms the on-disk PDF cache); the rest are converted a few at a time
    // instead of strictly one after another. The server has 2 vCPUs and the
    // heavy lifting happens outside the Node event loop (pdftoppm child
    // process, sharp's thread pool), so 2 at a time roughly halves the time
    // a document -- and every share link on it -- shows as "processing".
    const concurrency = Math.max(
      1,
      Number(process.env.PDF_CONVERT_CONCURRENCY) || 2,
    );
    const convert = (pageNumber: number) =>
      convertPageWithRetry({
        documentVersionId,
        pageNumber,
        url: signedUrl,
        teamId,
        trustedTeam,
      });

    const startedAt = Date.now();
    let conversionWithoutError = await convert(1);
    let nextPage = 2;
    const worker = async () => {
      while (conversionWithoutError && nextPage <= numPages!) {
        const pageNumber = nextPage++;
        const ok = await convert(pageNumber);
        if (!ok) conversionWithoutError = false;
      }
    };
    if (conversionWithoutError) {
      await Promise.all(Array.from({ length: concurrency }, worker));
    }
    await clearCachedPdf(documentVersionId);
    console.log("[pdf-inline] page conversion finished", {
      documentVersionId,
      numPages,
      seconds: Math.round((Date.now() - startedAt) / 1000),
    });

    if (!conversionWithoutError) {
      console.error("[pdf-inline] conversion failed", { documentVersionId });
      return;
    }

    await prisma.documentVersion.update({
      where: { id: documentVersionId },
      data: {
        numPages,
        hasPages: true,
        isPrimary: true,
      },
    });

    if (versionNumber) {
      await prisma.documentVersion.updateMany({
        where: {
          documentId,
          versionNumber: { not: versionNumber },
        },
        data: { isPrimary: false },
      });
    }

    try {
      await fetch(
        `${process.env.NEXTAUTH_URL}/api/revalidate?secret=${process.env.REVALIDATE_TOKEN}&documentId=${documentId}`,
      );
    } catch (error) {
      console.error("[pdf-inline] failed to revalidate", {
        documentId,
        error,
      });
    }

    console.log("[pdf-inline] conversion complete", {
      documentId,
      documentVersionId,
      numPages,
    });
  } catch (error) {
    console.error("[pdf-inline] unexpected error", {
      documentVersionId,
      error,
    });
  }
}
