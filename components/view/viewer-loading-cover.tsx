import { useEffect, useState } from "react";

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
// The rocking-horse SVG (RockingHorseIcon) is a "delayed" loading indicator,
// not shown on every load: a timer starts on mount, and the horse only
// renders if the thumbnail is STILL not loaded by the time that timer fires
// (COVER_DELAY_MS below). If the thumbnail is fast enough to load before the
// delay elapses, the horse never appears at all -- the page goes straight
// from blank background to the real image, with no loading-state flash for
// what was already a near-instant load. The <img> itself stays in the DOM
// the whole time regardless (so the preload scanner still picks it up
// immediately), just visually hidden via CSS until onLoad fires.
//
// If the thumbnail 404s or fails to load, the horse shows immediately (no
// delay -- there's nothing to wait for) and stays as the permanent fallback:
// video, sheet, HTML, and Notion documents have no static first-page image
// yet (see pages/api/public/thumbnail/[documentId].ts), and any other image
// load failure degrades the same way.
const COVER_DELAY_MS = 300;

export default function ViewerLoadingCover({
  documentId,
}: {
  documentId: string;
}) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [coverDelayElapsed, setCoverDelayElapsed] = useState(false);

  useEffect(() => {
    if (imageLoaded || imageFailed) return;
    const timer = setTimeout(() => setCoverDelayElapsed(true), COVER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [imageLoaded, imageFailed]);

  const showHorse = !imageLoaded && (imageFailed || coverDelayElapsed);

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
      {showHorse ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <RockingHorseIcon className="h-32 w-auto" />
        </div>
      ) : null}
    </div>
  );
}
