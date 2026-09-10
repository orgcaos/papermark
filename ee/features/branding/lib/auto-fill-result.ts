// Brand-asset auto-fill (extracting logo/colors from a URL) is out of scope
// for this deployment.

export const AUTO_FILL_NOT_FOUND_MESSAGE =
  "Automatic brand detection isn't available in this deployment.";

export function autoFillHasBrandAssets(
  _result: unknown,
  _options?: { allowBanner?: boolean },
): boolean {
  return false;
}
