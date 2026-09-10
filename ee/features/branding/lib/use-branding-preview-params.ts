// Only used by internal branding-preview demo pages, which are out of scope
// for this deployment. Real usage seeds these from URL search params (hence
// every field being a plain string, matched against literal values like
// "1" rather than parsed into booleans) and live-updates them over
// postMessage from the editor; here they simply stay empty.

export interface BrandingPreviewParams {
  brandLogo?: string;
  hideLogo?: string;
  brandColor?: string;
  brandBanner?: string;
  accentColor?: string;
  accentButtonColor?: string;
  applyAccentColorToDataroomView?: string;
  welcomeMessage?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  cardLayout?: string;
  showFolderTree?: string;
  viewerHeaderStyle?: string;
  hideFolderIconsInMain?: string;
}

export function useBrandingPreviewParams(): BrandingPreviewParams {
  return {};
}
