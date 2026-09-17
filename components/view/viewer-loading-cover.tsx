import { useState } from "react";

import RockingHorseIcon from "@/components/ui/rocking-horse-icon";

// Shows the document's real first page immediately, instead of a blank
// spinner, while the viewer's JS bundle loads and /api/views resolves.
// Reuses the existing public, unauthenticated thumbnail endpoint (already
// used for email-card thumbnails and social previews) rather than adding
// a new one.
//
// This is rendered by document-view.tsx in a state that also gets
// server-rendered into the page's static HTML (this page is
// getStaticProps/ISR) -- so for a first-time visitor, this <img> tag is
// already present in the raw HTML the server sends, and the browser's own
// preload scanner starts fetching it while parsing, before hydration and
// before most of the viewer's JS has even been requested. That's the
// actual point of this component: get *something* real on screen at the
// earliest possible moment, not just replace one spinner with another.
//
// Known, accepted tradeoff: once the real viewer mounts, it fetches page 1
// again itself via a signed URL (a different path, so the browser can't
// reuse this fetch) -- one small duplicate request for a single page
// image, in exchange for the page never looking empty. Not wired up to
// avoid that duplicate fetch; doing so would mean touching the core PDF
// viewer's page-loading logic, which is out of scope for this change.
//
// While the thumbnail is still loading, a rocking-horse SVG (RockingHorseIcon)
// is shown centered on the background in its place -- the <img> stays in the
// DOM the whole time (so the preload scanner still picks it up immediately),
// just visually hidden via CSS until onLoad fires, at which point the horse
// is swapped out for the now-loaded image. If the thumbnail 404s or fails to
// load, the horse stays as the permanent fallback -- video, sheet, HTML, and
// Notion documents have no static first-page image yet (see
// pages/api/public/thumbnail/[documentId].ts), and any other image load
// failure degrades the same way.
export default function ViewerLoadingCover({
  documentId,
}: {
  documentId: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="relative flex h-screen items-center justify-center bg-gray-950">
      {!imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element -- deliberately
        // a plain <img>, not next/image: this needs to be a plain tag in the
        // server-rendered HTML that the browser's preload scanner can pick
        // up immediately, without Next's image-optimization request hop
        // adding another round trip in front of it.
        <img
          src={`/api/public/thumbnail/${documentId}`}
          alt=""
          aria-hidden="true"
          onLoad={() => setImageLoaded(true)}
          onError={() => setImageFailed(true)}
          className="h-full w-full object-contain"
          style={{ visibility: imageLoaded ? "visible" : "hidden" }}
        />
      ) : null}
      {!imageLoaded || imageFailed ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <RockingHorseIcon className="h-16 w-auto" />
        </div>
      ) : null}
    </div>
  );
}
