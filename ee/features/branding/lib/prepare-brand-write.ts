// Custom branding is out of scope for this deployment; brand-write requests
// are never actually issued (the branding pages are disabled), so this just
// needs to exist for the (unused) API routes to compile and reject cleanly
// if ever called.

export interface BrandWriteData {
  name?: string;
  logo?: string | null;
  hideLogo?: boolean;
  banner?: string | null;
  brandColor?: string | null;
  accentColor?: string | null;
  accentButtonColor?: string | null;
  applyAccentColorToDataroomView?: boolean;
  welcomeMessage?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  privacyPolicyUrl?: string | null;
  cardLayout?: string;
  showFolderTree?: boolean;
  viewerLayoutPreset?: string;
  viewerHeaderStyle?: string;
  hideFolderIconsInMain?: boolean;
  customLinkPreviewEnabled?: boolean;
  linkPreviewTitle?: string | null;
  linkPreviewDescription?: string | null;
  linkPreviewImage?: string | null;
  linkPreviewFavicon?: string | null;
  defaultLanguage?: string;
}

export type PrepareBrandWriteResult =
  | { ok: true; data: BrandWriteData }
  | {
      ok: false;
      status: number;
      message: string;
      errors?: Record<string, string[] | undefined>;
    };

export async function prepareBrandWrite(_args: {
  body: unknown;
  teamId: string;
  plan: string;
  nameRequired?: boolean;
}): Promise<PrepareBrandWriteResult> {
  return {
    ok: false,
    status: 501,
    message: "Brand customization is not available in this deployment.",
  };
}
