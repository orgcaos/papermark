import { useState } from "react";

import { CheckIcon, CopyIcon } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type ShareLinkReadyModalData = {
  url: string;
  /** Bold heading -- the share link's own name, falling back to "Link #xxxxx" (same convention used everywhere else in the app, e.g. links-table.tsx's own row label). */
  title: string;
  /** Second line, shown as clickable text (not the raw URL) -- the document's file name, with its extension (via ensureFileExtension()). */
  fileName: string;
  /** Absolute, publicly-reachable URL for the document's first-page thumbnail. */
  thumbnailUrl: string;
};

// Shared by the modal's own "Copy formatted" button AND the top-level
// "Copy email card" buttons (document-header.tsx, links-table.tsx), which
// call this directly -- synchronously, in the same click handler that also
// opens this modal -- so the card is copied automatically on that first
// click instead of requiring a second click inside the modal. Calling it
// straight from those onClick handlers (before any `await`) keeps the
// actual `navigator.clipboard.write()` call tied to the click's user-
// activation, same as calling it from this modal's own button. Shows its
// own success/error toast so every caller gets consistent feedback without
// duplicating it. Added 2026-09-16 per Savvas's feedback.
export async function copyEmailCardToClipboard({
  url,
  title,
  fileName,
  thumbnailUrl,
}: {
  url: string;
  title: string;
  fileName: string;
  thumbnailUrl: string;
}): Promise<boolean> {
  try {
    // The HTML value can be a Promise<Blob> — both Chrome and Safari/WebKit
    // resolve it while keeping the write() call itself tied to the click's
    // user-activation, which is what lets an async step (fetching +
    // inlining the thumbnail below) run before the actual clipboard write
    // completes, without either browser rejecting the write for happening
    // "too late" after the gesture.
    const htmlBlobPromise = buildClipboardHtmlBlob({
      url,
      title,
      fileName,
      thumbnailUrl,
    });
    const textBlob = new Blob([`${fileName}: ${url}`], {
      type: "text/plain",
    });
    // Writing both text/html and text/plain lets Gmail/Apple Mail's
    // rich-content compose box render the card, while anything that only
    // accepts plain text still gets a sensible fallback.
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": htmlBlobPromise,
        "text/plain": textBlob,
      }),
    ]);
    toast.success("Formatted card copied — paste into Gmail or Mail");
    return true;
  } catch (error) {
    toast.error(
      "Couldn't copy formatted card — your browser may not support rich clipboard copy",
    );
    return false;
  }
}

/**
 * Shown right after creating a document share link. Gives the user two ways
 * to hand the link to someone: the plain URL, or a pre-built HTML "email
 * card" (thumbnail, link title, and a clickable file name, all pointing at
 * the share link) that pastes into Gmail/Apple Mail compose as rich content
 * instead of a raw link — this is what actually drives clicks from an
 * email, per Savvas's own reasoning for prioritizing this feature.
 */
export function ShareLinkReadyModal({
  data,
  onClose,
}: {
  data: ShareLinkReadyModalData | null;
  onClose: () => void;
}) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [formattedCopied, setFormattedCopied] = useState(false);

  if (!data) return null;

  const { url, title, fileName, thumbnailUrl } = data;

  // Preview shown in the textarea below — kept as a plain hotlinked <img>
  // (short, human-readable) even though the actual clipboard copy inlines
  // the image as a data URI instead. See buildClipboardHtml().
  const cardHtml = buildEmailCardHtml({ url, title, fileName, thumbnailUrl });

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setUrlCopied(true);
      toast.success("Link copied");
      setTimeout(() => setUrlCopied(false), 2000);
    } catch (error) {
      toast.error("Failed to copy link");
    }
  };

  const handleCopyFormatted = async () => {
    const ok = await copyEmailCardToClipboard({ url, title, fileName, thumbnailUrl });
    if (ok) {
      setFormattedCopied(true);
      setTimeout(() => setFormattedCopied(false), 2000);
    }
  };

  return (
    <Dialog open={!!data} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share link ready</DialogTitle>
          <DialogDescription>
            Copy the URL or paste the rich card directly into Gmail or Mail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                URL
              </Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleCopyUrl}
              >
                {urlCopied ? (
                  <CheckIcon className="mr-1 h-3 w-3" />
                ) : (
                  <CopyIcon className="mr-1 h-3 w-3" />
                )}
                Copy
              </Button>
            </div>
            <Input readOnly value={url} className="font-mono text-xs" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Email card (rich HTML)
              </Label>
              <Button
                variant="secondary"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={handleCopyFormatted}
              >
                {formattedCopied ? (
                  <CheckIcon className="mr-1 h-3 w-3" />
                ) : (
                  <CopyIcon className="mr-1 h-3 w-3" />
                )}
                Copy formatted
              </Button>
            </div>
            <Textarea
              readOnly
              value={cardHtml}
              rows={5}
              className="resize-none font-mono text-xs text-muted-foreground"
            />
            <p className="text-xs text-muted-foreground">
              Click <span className="font-medium">Copy formatted</span> then
              paste into Gmail or Apple Mail compose — it&apos;ll render as
              the deck card, not raw HTML.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Horizontal card layout (thumbnail left, title + file name stacked on
// the right) — matches the reference card Savvas asked to match (a HubSpot
// Sales Documents email card). Title is the share link's own name (not the
// document name), and the second line shows the file name as clickable
// text instead of the raw URL -- both changed 2026-09-14 per Savvas's
// feedback. Thumbnail keeps the document's natural aspect ratio, bounded
// by a 108x108 box instead of a forced 1:1 crop -- changed 2026-09-15 per
// Savvas's feedback. A symmetric box (rather than a wide-but-short one)
// means a landscape document (e.g. 16:9 slides) renders noticeably bigger
// than a portrait one, since only the portrait case is height-limited --
// also per Savvas's feedback (2026-09-15).
//
// Colors/spacing/type tuned by Savvas directly in a CodePen mockup and
// ported back verbatim (2026-09-15): accent color #904F44 (border, filename
// link, replacing the earlier #BB5E4E border / blue #2563eb filename link),
// off-white #FBFBF9 background (was pure white), 6px card corners / 5px
// thumbnail corners (was 8px/6px). The thumbnail cell's padding was bumped
// to 18px, and -- this was the actual bug Savvas caught -- its old fixed
// `width:112px` was dropped entirely: that width hint was smaller than the
// thumbnail's content box on a wide (landscape) image but larger than it
// on a narrow (portrait) one, so the gap between the thumbnail and the
// text was inconsistent (tight on landscape, loose on portrait). Letting
// the cell size purely from its padding + the image's own (already-capped)
// width makes the gap constant regardless of the thumbnail's aspect ratio.
//
// Sized up and tightened again (2026-09-17) per Savvas's feedback: overall
// card max-width 400px -> 440px and the thumbnail box 96x96 -> 108x108
// (both "a bit bigger"), thumbnail cell padding 18px -> 14px and text cell
// padding 12/16/12/0 -> 10/14/10/0 ("a bit less padding"), title 20px ->
// 18px ("a tiny bit smaller"). `fetchThumbnailAsDataUrl`'s retina encode
// target bumped 192 -> 216 (still 2x the display box) to match.
function buildEmailCardHtml({
  url,
  title,
  fileName,
  thumbnailUrl,
}: {
  url: string;
  title: string;
  fileName: string;
  thumbnailUrl: string;
}) {
  const escapedTitle = title.replace(/"/g, "&quot;");
  const escapedFileName = fileName.replace(/"/g, "&quot;");

  // border-collapse:separate;border-spacing:0 -- without an explicit value
  // here, whatever page renders this table wins (e.g. Tailwind Preflight's
  // global `table { border-collapse: collapse }`), and border-radius has
  // no visual effect on a table once collapsed (spec behavior, confirmed
  // 2026-09-15 via orgcaos-hubspot's Compose preview rendering this card
  // with square corners despite border-radius:6px). Pin it so the card
  // looks right wherever it's embedded.
  // width:1%;white-space:nowrap on the thumbnail cell is the standard
  // email-HTML "shrink to fit" idiom, not a real 1% -- neither cell has a
  // width, so the table's auto layout algorithm has to guess how to split
  // the 400px between them, and confirmed 2026-09-15 (via orgcaos-hubspot,
  // which renders this same markup) it was splitting roughly 50/50
  // (thumbnail cell ~200px, image only 96px of that) rather than shrinking
  // the thumbnail column to its content, leaving a large, wrong gap before
  // the text. This is deliberately NOT a fixed pixel width like the old
  // `width:112px` mentioned above -- that was removed because a fixed
  // width didn't match every thumbnail's actual (aspect-ratio-dependent)
  // rendered size, making the gap inconsistent between landscape and
  // portrait documents. width:1% just tells the layout algorithm "give
  // this column no surplus space, size it from its content" -- the
  // thumbnail cell still hugs the image's real rendered width (whatever
  // that is) plus its own padding, exactly as before, it just no longer
  // also absorbs half the table's free space.
  return (
    `<table style="max-width:440px;width:100%;border:1.5px solid #904F44;border-radius:6px;background-color:#FBFBF9;box-shadow:none;border-collapse:separate;border-spacing:0" cellpadding="0" cellspacing="0"><tbody>` +
    `<tr>` +
    `<td style="padding:14px;width:1%;white-space:nowrap" valign="top"><a href="${url}" target="_blank" style="text-decoration:none"><img alt="${escapedTitle}" src="${thumbnailUrl}" style="display:block;max-width:108px;max-height:108px;width:auto;height:auto;border-radius:5px;border:0" /></a></td>` +
    `<td style="padding:10px 14px 10px 0" valign="middle">` +
    `<a href="${url}" target="_blank" style="display:block;color:#1a1f36;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:1.25;font-weight:bold;text-decoration:none">${escapedTitle}</a>` +
    `<a href="${url}" target="_blank" style="display:block;margin-top:8px;color:#904F44;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.25;text-decoration:underline;word-break:break-all">${escapedFileName}</a>` +
    `</td>` +
    `</tr>` +
    `</tbody></table>`
  );
}

// Apple Mail (and, to a lesser extent, Gmail) blocks remote-hosted <img>
// content by default — Mail's "Protect Mail Activity" / "Block All Remote
// Content" privacy setting has been on by default since macOS Monterey, and
// it blocks any image loaded from a remote URL, including one referenced in
// pasted HTML, not just images in received mail. A hotlinked thumbnail URL
// is therefore invisible for a large share of recipients by default.
//
// Fixed by inlining the thumbnail as a base64 data: URI at copy time, so the
// picture is part of the clipboard payload itself and doesn't depend on any
// mail client fetching anything. Downscaled to a small on-screen size first
// (the card only ever displays it at max 96x96) so this doesn't balloon
// the size of every pasted card with a full-resolution page render.
async function buildClipboardHtmlBlob({
  url,
  title,
  fileName,
  thumbnailUrl,
}: {
  url: string;
  title: string;
  fileName: string;
  thumbnailUrl: string;
}): Promise<Blob> {
  const inlineThumbnail = await fetchThumbnailAsDataUrl(thumbnailUrl);
  const html = buildEmailCardHtml({
    url,
    title,
    fileName,
    // Falls back to the hotlinked URL if inlining fails for any reason
    // (network hiccup, no thumbnail available for this document type) —
    // same behavior as before this fix, not a regression.
    thumbnailUrl: inlineThumbnail ?? thumbnailUrl,
  });
  return new Blob([html], { type: "text/html" });
}

async function fetchThumbnailAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();

    const bitmap = await createImageBitmap(blob);
    const maxDim = 216; // 2x the card's 108px display box, for retina
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } catch (error) {
    console.error("Failed to inline email-card thumbnail", error);
    return null;
  }
}
