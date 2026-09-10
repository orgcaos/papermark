// Redaction is out of scope for this deployment; the standalone redaction
// workspace page (pages/documents/[id]/redactions/[jobId].tsx) is unreachable
// in the app's normal navigation since the button that would link to it
// (RedactionLauncher) never renders.

export function RedactionWorkspace(_props: Record<string, unknown>) {
  return null;
}
