// Custom branding is out of scope for this deployment.

export interface BrandingLinkPreviewFormProps {
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  title: string | null;
  onTitleChange: (title: string) => void;
  description: string | null;
  onDescriptionChange: (description: string) => void;
  imageUrl: string | null;
  onImageChange: (imageUrl: string | null) => void;
  faviconUrl: string | null;
  onFaviconChange: (faviconUrl: string | null) => void;
  inheritanceHint?: string;
}

export function BrandingLinkPreviewForm(
  _props: BrandingLinkPreviewFormProps,
) {
  return null;
}
