import { ONE_HOUR } from "@/lib/constants";

// Lifetime of the signed URLs handed to the document viewer for page images
// and their overlay media. This is the signer's hard cap (presign-get-url.ts
// clamps to one hour); the previous 2-minute default broke any page the
// reader reached later than that. The viewer re-signs a page on image load
// error (use-lazy-pages.ts `refreshPageUrl`), which covers reads longer than
// an hour and any other transient failure.
export const PAGE_URL_TTL = ONE_HOUR;
