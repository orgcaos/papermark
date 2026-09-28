import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@/lib/prisma";
import {
  buildShortSlugBase,
  generateUniqueShortSlug,
} from "@/lib/utils/generate-short-slug";
import { constructLinkUrl } from "@/lib/utils/link-url";

// Internal, server-to-server: create (or find) the per-recipient copy of a
// share link, for the Orgcaos CRM's "one Docket link per person written to"
// (crm-2-plan.md §8 over in ~/orgcaos-hubspot). The CRM sends the same deck
// to thirty people a week; with one shared link Docket can say "14 views"
// but not who. Cloning the link per recipient at save time -- named after
// the person, same settings, same document, its own pretty URL -- makes
// every view attributable, and the CRM can then show "opened the deck Wed
// 14:02" next to the email that carried it.
//
// Same Bearer-token gate as pages/api/internal/cards/list.ts; the key never
// reaches a browser.
//
// POST { sourceLinkId, name }
//  -> 200 { linkId, url, name, created }   created=false when a live link
//                                          with this source + name already
//                                          existed (one link per person, so
//                                          a follow-up to the same contact
//                                          reuses it and their views stay in
//                                          one place)
//  -> 404 when the source isn't a live document link
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "POST") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const body = (req.body ?? {}) as { sourceLinkId?: unknown; name?: unknown };
  const sourceLinkId =
    typeof body.sourceLinkId === "string" ? body.sourceLinkId.trim() : "";
  const name =
    typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (!sourceLinkId || !name) {
    res.status(400).json({ message: "sourceLinkId and name are required" });
    return;
  }

  try {
    const source = await prisma.link.findFirst({
      where: {
        id: sourceLinkId,
        deletedAt: null,
        linkType: "DOCUMENT_LINK",
        documentId: { not: null },
      },
      include: {
        document: { select: { id: true, name: true } },
        tags: { select: { tagId: true, taggedBy: true } },
      },
    });
    if (!source || !source.document) {
      res.status(404).json({ message: "Source link not found" });
      return;
    }

    // One link per (deck, person): a second email to the same contact with
    // the same deck lands on the link that already carries their views.
    const existing = await prisma.link.findFirst({
      where: {
        sourceLinkId: source.id,
        name,
        deletedAt: null,
        isArchived: false,
      },
      select: {
        id: true,
        name: true,
        domainId: true,
        domainSlug: true,
        slug: true,
        shortSlug: true,
      },
    });
    if (existing) {
      res.status(200).json({
        linkId: existing.id,
        url: constructLinkUrl(existing),
        name: existing.name,
        created: false,
      });
      return;
    }

    // Always a main-domain pretty URL, based on the DOCUMENT's name (not the
    // recipient's -- the URL is what they see, and "services-book-k7m2"
    // reads as a link to the deck, not as tracking). Custom domains are not
    // carried over: the source's domain slug is unique to it.
    const shortSlug = await generateUniqueShortSlug(
      buildShortSlugBase(source.document.name),
    );

    const link = await prisma.$transaction(async (tx) => {
      const created = await tx.link.create({
        data: {
          sourceLinkId: source.id,
          name,
          shortSlug,
          documentId: source.documentId,
          dataroomId: null,
          linkType: "DOCUMENT_LINK",
          teamId: source.teamId,
          ownerId: source.ownerId,
          // Everything the viewer experiences is inherited from the source
          // link as it is right now -- gating, download, watermark,
          // welcome, meta tags, brand, notifications.
          password: source.password,
          emailProtected: source.emailProtected,
          emailAuthenticated: source.emailAuthenticated,
          expiresAt: source.expiresAt,
          allowDownload: source.allowDownload,
          enableNotification: source.enableNotification,
          enableFeedback: source.enableFeedback,
          enableScreenshotProtection: source.enableScreenshotProtection,
          enableConfidentialView: source.enableConfidentialView,
          enableCustomMetatag: source.enableCustomMetatag,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
          metaImage: source.metaImage,
          metaFavicon: source.metaFavicon,
          welcomeMessage: source.welcomeMessage,
          brandId: source.brandId,
          allowList: source.allowList,
          denyList: source.denyList,
          audienceType: source.audienceType,
          groupId: source.groupId,
          permissionGroupId: source.permissionGroupId,
          enableAgreement: source.enableAgreement,
          agreementId: source.agreementId,
          enableWatermark: source.enableWatermark,
          watermarkConfig: source.watermarkConfig ?? undefined,
          showBanner: source.showBanner,
          enableAIAgents: source.enableAIAgents,
          enableConversation: source.enableConversation,
          enableIndexFile: source.enableIndexFile,
          // Not carried over: custom fields / the feedback question /
          // visitor groups / uploads -- none apply to a plain deck link, and
          // each is its own related table.
        },
        select: {
          id: true,
          name: true,
          domainId: true,
          domainSlug: true,
          slug: true,
          shortSlug: true,
        },
      });

      if (source.tags.length > 0) {
        await tx.tagItem.createMany({
          data: source.tags.map((t) => ({
            tagId: t.tagId,
            itemType: "LINK_TAG" as const,
            linkId: created.id,
            taggedBy: t.taggedBy,
          })),
        });
      }
      return created;
    });

    res.status(200).json({
      linkId: link.id,
      url: constructLinkUrl(link),
      name: link.name,
      created: true,
    });
  } catch (error) {
    console.error("internal/links/create failed", error);
    res.status(500).json({ message: "Failed to create the recipient link" });
  }
}
