// Custom team/dataroom branding is out of scope for this deployment (the
// default Papermark wordmark is used everywhere), so this always resolves to
// "no custom logo" rather than reimplementing the upstream enterprise
// branding subsystem.

export type BrandLogoFields = {
  logo?: string | null;
  hideLogo?: boolean | null;
};

export type ResolvedBrandLogo =
  | { kind: "custom"; src: string }
  | { kind: "papermark" }
  | { kind: "none" };

export function resolveBrandLogo(
  brand?: BrandLogoFields | null,
): ResolvedBrandLogo {
  if (!brand) return { kind: "papermark" };
  if (brand.hideLogo) return { kind: "none" };
  if (brand.logo) return { kind: "custom", src: brand.logo };
  return { kind: "papermark" };
}
