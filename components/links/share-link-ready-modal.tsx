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
    try {
      // The HTML value can be a Promise<Blob> — both Chrome and Safari/
      // WebKit resolve it while keeping the write() call itself tied to
      // this click's user-activation, which is what lets an async step
      // (fetching + inlining the thumbnail below) run before the actual
      // clipboard write completes, without either browser rejecting the
      // write for happening "too late" after the gesture.
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
      // rich-content compose box render the card, while anything that
      // only accepts plain text still gets a sensible fallback.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlobPromise,
          "text/plain": textBlob,
        }),
      ]);
      setFormattedCopied(true);
      toast.success("Formatted card copied — paste into Gmail or Mail");
      setTimeout(() => setFormattedCopied(false), 2000);
    } catch (error) {
      toast.error(
        "Couldn't copy formatted card — your browser may not support rich clipboard copy",
      );
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
// feedback. Border uses the Orgcaos accent color, no shadow. Thumbnail
// keeps the document's natural aspect ratio, bounded by a 96x96 box
// instead of a forced 1:1 crop -- changed 2026-09-15 per Savvas's
// feedback. A symmetric box (rather than a wide-but-short one) means a
// landscape document (e.g. 16:9 slides) renders noticeably bigger than a
// portrait one, since only the portrait case is height-limited -- also
// per Savvas's feedback (2026-09-15).
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

  return (
    `<table style="max-width:400px;width:100%;border:1px solid #BB5E4E;border-radius:8px;background-color:#ffffff;box-shadow:none" cellpadding="0" cellspacing="0"><tbody>` +
    `<tr>` +
    `<td style="width:112px;padding:12px" valign="top"><a href="${url}" target="_blank" style="text-decoration:none"><img alt="${escapedTitle}" src="${thumbnailUrl}" style="display:block;max-width:96px;max-height:96px;width:auto;height:auto;border-radius:6px;border:0" /></a></td>` +
    `<td style="padding:12px 16px 12px 0" valign="middle">` +
    `<a href="${url}" target="_blank" style="display:block;color:#1a1f36;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.35;font-weight:bold;text-decoration:none">${escapedTitle}</a>` +
    `<a href="${url}" target="_blank" style="display:block;margin-top:4px;color:#2563eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;text-decoration:underline;word-break:break-all">${escapedFileName}</a>` +
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
    const maxDim = 192; // 2x the card's 96px display box, for retina
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
