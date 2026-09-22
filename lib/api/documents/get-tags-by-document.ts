import prisma from "@/lib/prisma";
import { TagProps } from "@/lib/types";

/**
 * Docket has no separate "tag a document directly" feature -- tags are only
 * ever assignable on a share link (see components/links/link-sheet/tags/).
 * Savvas asked for the Documents list to show "the relevant tags from the
 * file" anyway (build-status.md, 2026-09-22, "tags on the file"); confirmed
 * with him directly that this means the union of tags already set on that
 * document's own link(s), not a new document-level tagging system.
 *
 * Batch-fetches every LINK_TAG attached to any active (non-deleted) link on
 * the given documents in a single query (same N+1-avoidance pattern already
 * used by pages/api/teams/[teamId]/documents/[id]/links.ts), and returns
 * them grouped by documentId with duplicates removed -- a document reaches
 * the same tag more than once if two of its links both carry it.
 */
export async function getTagsByDocumentId(
  documentIds: string[],
): Promise<Record<string, TagProps[]>> {
  if (documentIds.length === 0) return {};

  const tagItems = await prisma.tagItem.findMany({
    where: {
      itemType: "LINK_TAG",
      link: {
        documentId: { in: documentIds },
        deletedAt: null,
      },
    },
    select: {
      link: { select: { documentId: true } },
      tag: {
        select: { id: true, name: true, color: true, description: true },
      },
    },
  });

  const tagsByDocumentId: Record<string, TagProps[]> = {};
  const seen = new Set<string>(); // `${documentId}:${tagId}`, for de-duping

  for (const item of tagItems) {
    const documentId = item.link?.documentId;
    if (!documentId) continue;
    const key = `${documentId}:${item.tag.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    (tagsByDocumentId[documentId] ??= []).push(item.tag);
  }

  return tagsByDocumentId;
}
