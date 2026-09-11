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
  documentName: string;
  /** Absolute, publicly-reachable URL for the document's first-page thumbnail. */
  thumbnailUrl: string;
};

/**
 * Shown right after creating a document share link. Gives the user two ways
 * to hand the link to someone: the plain URL, or a pre-built HTML "email
 * card" (thumbnail + title, all clickable) that pastes into Gmail compose as
 * rich content instead of a raw link — this is what actually drives clicks
 * from an email, per Savvas's own reasoning for prioritizing this feature.
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

  const { url, documentName, thumbnailUrl } = data;

  const cardHtml = buildEmailCardHtml({ url, documentName, thumbnailUrl });

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
      const htmlBlob = new Blob([cardHtml], { type: "text/html" });
      const textBlob = new Blob([`${documentName}: ${url}`], {
        type: "text/plain",
      });
      // Writing both text/html and text/plain lets Gmail's rich-content
      // compose box render the card, while anything that only accepts
      // plain text still gets a sensible fallback.
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": htmlBlob,
          "text/plain": textBlob,
        }),
      ]);
      setFormattedCopied(true);
      toast.success("Formatted card copied — paste into Gmail compose");
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
            Copy the URL or paste the rich card directly into Gmail.
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
              paste into Gmail compose — it&apos;ll render as the deck card,
              not raw HTML.
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

function buildEmailCardHtml({
  url,
  documentName,
  thumbnailUrl,
}: {
  url: string;
  documentName: string;
  thumbnailUrl: string;
}) {
  const escapedName = documentName.replace(/"/g, "&quot;");

  return (
    `<table style="max-width:400px;width:100%;border:solid 1px #1f2937;padding:8px;border-radius:2px" cellpadding="0" cellspacing="0"><tbody>` +
    `<tr><td style="text-align:center"><a href="${url}" target="_blank" style="text-decoration:none"><img alt="${escapedName}" src="${thumbnailUrl}" style="display:block;margin:0 auto;max-width:150px;max-height:150px;width:auto;height:auto;border-radius:4px;border:0" /></a></td></tr>` +
    `<tr><td style="text-align:center;padding-top:8px"><a href="${url}" target="_blank" style="color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;text-decoration:none">${escapedName}</a></td></tr>` +
    `<tr><td style="text-align:center;padding-top:4px"><a href="${url}" target="_blank" style="color:#2563eb;font-family:Arial,Helvetica,sans-serif;font-size:12px;text-decoration:underline">View document &#8594;</a></td></tr>` +
    `</tbody></table>`
  );
}
