// Dataroom banner customization is out of scope for this deployment, but the
// dataroom viewer still needs to render *some* banner (the built-in default
// banner image, or whatever URL a dataroom happens to have) — so, unlike the
// other stubs in ee/features/branding, this can't just always report "none".
// This classifies a banner URL by simple pattern-matching (YouTube link,
// common video file extension, otherwise treated as an image).

export type DataroomBannerKind = "none" | "image" | "video" | "youtube";

export type ClassifiedDataroomBanner = {
  kind: DataroomBannerKind;
  src?: string;
  youtubeId?: string;
};

const YOUTUBE_ID_RE =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

const VIDEO_EXTENSION_RE = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;

export function classifyDataroomBanner(
  banner: unknown,
): ClassifiedDataroomBanner {
  if (typeof banner !== "string" || !banner || banner === "no-banner") {
    return { kind: "none" };
  }

  const youtubeMatch = banner.match(YOUTUBE_ID_RE);
  if (youtubeMatch) {
    return { kind: "youtube", src: banner, youtubeId: youtubeMatch[1] };
  }

  if (VIDEO_EXTENSION_RE.test(banner)) {
    return { kind: "video", src: banner };
  }

  return { kind: "image", src: banner };
}
