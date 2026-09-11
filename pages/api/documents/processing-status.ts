import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@/lib/prisma";

/**
 * Lightweight polling endpoint for FileProcessStatusBar. Replaces the old
 * Trigger.dev realtime-run subscription (which needed a TRIGGER_SECRET_KEY
 * this deployment never configured, and would otherwise leave the
 * "Converting document..." bar spinning forever - see
 * lib/documents/process-pdf-inline.ts) with a plain poll against the
 * document version's own hasPages/numPages fields.
 *
 * Keyed only by documentVersionId (an unguessable cuid, never enumerated or
 * exposed outside the owner's own dashboard) and returns only processing
 * status - no document content - matching the trust model already used by
 * the old /api/progress-token endpoint this replaces.
 */
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { documentVersionId } = req.query;

  if (!documentVersionId || typeof documentVersionId !== "string") {
    return res.status(400).json({ error: "Document version ID is required" });
  }

  try {
    const version = await prisma.documentVersion.findUnique({
      where: { id: documentVersionId },
      select: { hasPages: true, numPages: true },
    });

    if (!version) {
      return res.status(404).json({ error: "Not found" });
    }

    const pagesConverted = version.hasPages
      ? version.numPages
      : await prisma.documentPage.count({
          where: { versionId: documentVersionId },
        });

    return res.status(200).json({
      hasPages: version.hasPages,
      numPages: version.numPages,
      pagesConverted,
    });
  } catch (error) {
    console.error("[processing-status] error", { documentVersionId, error });
    return res.status(500).json({ error: "Failed to fetch status" });
  }
}
