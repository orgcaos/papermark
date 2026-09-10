// Logo tone (light/dark) detection is out of scope for this deployment
// (only used by dataroom branding, which isn't supported); a fixed "dark"
// tone matches the upstream default before analysis completes.

export function useLogoTone(_src?: string | null): {
  tone: "light" | "dark";
  imgProps: Record<string, unknown>;
} {
  return { tone: "dark", imgProps: {} };
}
