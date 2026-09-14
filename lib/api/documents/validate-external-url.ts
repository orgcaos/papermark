import { get } from "@vercel/edge-config";
import { parsePageId } from "notion-utils";

import { PapermarkApiError } from "@/lib/api/errors";
import { isTrustedTeam } from "@/lib/edge-config/trusted-teams";
import notion from "@/lib/notion";
import { getNotionPageIdFromSlug } from "@/lib/notion/utils";
import { log } from "@/lib/utils";

// Query strings and fragments can carry tokens or PII, so log origin + path
// only — the same rule the blocked-keyword alert below follows.
function describeUrlForLog(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return value;
  }
}

function causeForLog(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validates the external URL backing a `notion` or `link` document: Notion
 * pages must be publicly accessible, and link URLs must be well-formed and not
 * match the blocked-keyword list (skipped for trusted teams). Throws on
 * failure. Shared by document creation (processDocument) and version creation
 * so the two paths can't drift.
 */
export async function validateExternalDocumentUrl({
  type,
  key,
  teamId,
}: {
  type: string;
  key: string;
  teamId: string;
}): Promise<void> {
  // Check whether the Notion page is publically accessible or not
  if (type === "notion") {
    try {
      let pageId = parsePageId(key, { uuid: false });

      // If parsePageId fails, try to get page ID from slug
      if (!pageId) {
        try {
          const pageIdFromSlug = await getNotionPageIdFromSlug(key);
          pageId = pageIdFromSlug || undefined;
        } catch (slugError) {
          throw new Error("Unable to extract page ID from Notion URL");
        }
      }

      // if the page isn't accessible then end the process here.
      if (!pageId) {
        throw new Error("Notion page not found");
      }
      await notion.getPage(pageId);
    } catch (error) {
      console.error("[validateExternalDocumentUrl] Notion page check failed", {
        teamId,
        url: describeUrlForLog(key),
        cause: causeForLog(error),
      });
      throw new PapermarkApiError(
        "unprocessable_entity",
        "This Notion page isn't publically available.",
      );
    }
  }

  // For link type, validate URL format
  if (type === "link") {
    try {
      const parsed = new URL(key);

      // Skip keyword check for trusted teams, and skip it entirely when no
      // Edge Config is configured (e.g. this self-hosted deployment) --
      // @vercel/edge-config's `get()` throws when EDGE_CONFIG isn't set,
      // which previously got caught below and surfaced as a misleading
      // "Invalid URL format for link document" error on every weblink
      // upload, regardless of the URL entered. isTrustedTeam already
      // no-ops the same way for the same reason.
      const trusted = await isTrustedTeam(teamId);
      if (!trusted && process.env.EDGE_CONFIG) {
        const keywords = await get("keywords");
        if (Array.isArray(keywords) && keywords.length > 0) {
          const matchedKeyword = keywords.find(
            (keyword) =>
              typeof keyword === "string" &&
              key.toLowerCase().includes(keyword.toLowerCase()),
          );

          if (matchedKeyword) {
            // Log only origin + pathname so query strings / fragments (which
            // can carry tokens or PII) never reach the alerting channel.
            // Awaited so the alert is delivered before we throw and unwind.
            await log({
              message: `Link document creation blocked: ${matchedKeyword} \n\n \`Metadata: {teamId: ${teamId}, url: ${parsed.origin}${parsed.pathname}}\``,
              type: "error",
              mention: true,
            });
            throw new Error("This URL is not allowed");
          }
        }
      }
    } catch (error) {
      console.error("[validateExternalDocumentUrl] Link URL check failed", {
        teamId,
        url: describeUrlForLog(key),
        cause: causeForLog(error),
      });
      throw new PapermarkApiError(
        "unprocessable_entity",
        "Invalid URL format for link document.",
      );
    }
  }
}
