import { type Rotation } from "@/lib/hooks/use-fullscreen";

// Confidential (watermarked/no-select) viewing is a plan-gated premium
// feature that's out of scope for this deployment. It's only ever rendered
// when a link has confidential view explicitly enabled, which this
// deployment has no UI to turn on, so this safely renders nothing. Some
// callers pass navbarAbove/rotation (used to position the real overlay
// around the page navbar) - accepted here only so those call sites compile.
export function ConfidentialViewOverlay(
  _props: { navbarAbove?: boolean; rotation?: Rotation } = {},
) {
  return null;
}
