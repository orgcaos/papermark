// Team-level brand-driven link previews are out of scope for this
// deployment (teamBrandOgSelect only ever resolves an id, no preview
// fields), but a dataroom's own custom link-preview fields, and a link's
// own custom social-preview fields (set directly on the link, not via a
// brand), are plain, non-enterprise Papermark features and are still
// honored here. The link's own settings take priority over the
// dataroom's when both are present.

export type ResolvedPublicLinkMeta = {
  enableCustomMetatag: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  metaImage: string | null;
  metaFavicon: string | null;
};

type DataroomLinkPreviewBrand = {
  customLinkPreviewEnabled: boolean;
  linkPreviewTitle: string | null;
  linkPreviewDescription: string | null;
  linkPreviewImage: string | null;
  linkPreviewFavicon: string | null;
} | null;

export function resolvePublicLinkMeta(args: {
  link: {
    enableCustomMetatag: boolean;
    metaTitle?: string | null;
    metaDescription?: string | null;
    metaImage?: string | null;
    metaFavicon?: string | null;
  };
  teamBrand?: unknown;
  dataroomBrand?: DataroomLinkPreviewBrand;
  defaultTitle: string;
  [key: string]: unknown;
}): ResolvedPublicLinkMeta {
  const { link, dataroomBrand, defaultTitle } = args;

  // The link's own custom metatag settings take priority.
  if (link.enableCustomMetatag) {
    return {
      enableCustomMetatag: true,
      metaTitle: link.metaTitle || defaultTitle,
      metaDescription: link.metaDescription || null,
      metaImage: link.metaImage || null,
      metaFavicon: link.metaFavicon || "/favicon.ico",
    };
  }

  // Otherwise fall back to the dataroom's own link-preview settings, if any.
  if (dataroomBrand?.customLinkPreviewEnabled) {
    return {
      enableCustomMetatag: true,
      metaTitle: dataroomBrand.linkPreviewTitle || defaultTitle,
      metaDescription: dataroomBrand.linkPreviewDescription || null,
      metaImage: dataroomBrand.linkPreviewImage || null,
      metaFavicon: dataroomBrand.linkPreviewFavicon || "/favicon.ico",
    };
  }

  return {
    enableCustomMetatag: false,
    metaTitle: null,
    metaDescription: null,
    metaImage: null,
    metaFavicon: "/favicon.ico",
  };
}
