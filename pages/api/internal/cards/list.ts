import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@/lib/prisma";

// Internal, server-to-server endpoint: lists every currently-active share
// link (not expired, not archived, not soft-deleted) with the fields the
// Templates + Snippets tool needs to render an email card identical to the
// one this app's own ShareLinkReadyModal produces (see
// components/links/share-link-ready-modal.tsx's buildEmailCardHtml).
//
// Gated by the same shared-secret Bearer-token pattern already used by
// pages/api/mupdf/convert-page.ts and friends — not the public/unauthenticated
// pattern used by the thumbnail endpoint below, since listing every active
// link (rather than serving one already-unguessable document's preview) is
// exactly the kind of enumerable, sensitive listing that pattern deliberately
// avoids. Templates' Next.js server calls this directly, server-to-server;
// the key is never sent to a browser.
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const links = await prisma.link.findMany({
      where: {
        isArchived: false,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        // This tool only ever hands out document-level share cards (not
        // dataroom/workflow links, which don't have a single document's
        // thumbnail to show) — same scope as ShareLinkReadyModal, which is
        // only ever opened from a document-link creation flow.
        linkType: "DOCUMENT_LINK",
        documentId: { not: null },
      },
      select: {
        id: true,
        name: true,
        slug: true,
        domainId: true,
        domainSlug: true,
        createdAt: true,
        document: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Tags: each card is already exactly one link, so no union/aggregation
    // needed here (contrast lib/api/documents/get-tags-by-document.ts, used
    // by Docket's own Documents list, where one document can have several
    // links). Batch-fetched in one query rather than per-link, same
    // N+1-avoidance pattern used throughout this codebase's tag lookups.
    const linkIds = links.map((link) => link.id);
    const tagItems = await prisma.tagItem.findMany({
      where: { itemType: "LINK_TAG", linkId: { in: linkIds } },
      select: {
        linkId: true,
        tag: { select: { id: true, name: true, color: true } },
      },
    });
    const tagsByLinkId = new Map<string, { id: string; name: string; color: string }[]>();
    for (const item of tagItems) {
      if (!item.linkId) continue;
      const existing = tagsByLinkId.get(item.linkId);
      if (existing) existing.push(item.tag);
      else tagsByLinkId.set(item.linkId, [item.tag]);
    }

    const baseUrl = process.env.NEXT_PUBLIC_MARKETING_URL;

    const cards = links
      .filter((link) => link.document)
      .map((link) => {
        const url = link.domainId
          ? `https://${link.domainSlug}/${link.slug}`
          : `${baseUrl}/view/${link.id}`;

        return {
          linkId: link.id,
          // Prefer the link's own name (set when Savvas names a link
          // explicitly, e.g. per-recipient); fall back to the document's
          // name, same fallback ShareLinkReadyModal's caller already uses.
          label: link.name || link.document!.name,
          documentName: link.document!.name,
          url,
          thumbnailUrl: `${baseUrl}/api/public/thumbnail/${link.document!.id}`,
          createdAt: link.createdAt,
          tags: tagsByLinkId.get(link.id) ?? [],
        };
      });

    res.status(200).json({ cards });
  } catch (error) {
    res.status(500).json({ message: "Failed to list active cards" });
  }
}
