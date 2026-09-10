// Custom branding (multiple saved brands per team) is out of scope for this
// deployment.

export const DRAFT_TEAM_BRAND_ID = "draft";

export function nextTeamBrandName(_existingBrands: unknown[]): string {
  return "Default";
}

export function TeamBrandSwitcher(_props: Record<string, unknown>) {
  return null;
}
