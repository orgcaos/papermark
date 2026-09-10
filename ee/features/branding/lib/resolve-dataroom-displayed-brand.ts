// Custom branding is out of scope for this deployment, so dataroom links
// always behave as if no brand (team-level or dataroom-level) is configured.

export const CUSTOM_DATAROOM_BRAND = "custom" as const;
export const CUSTOM_DATAROOM_BRAND_LABEL = "Custom brand";

export function inheritsTeamBrand(_args: {
  linkBrandId?: string | null;
  dataroomBrandId?: string | null;
  hasDataroomBrand?: boolean;
}): boolean {
  return true;
}

export function resolveDisplayedDataroomBrand(_args: {
  dataroomBrand?: unknown;
  teamBrand?: unknown;
  inheritTeamBrand?: boolean;
}): null {
  return null;
}
