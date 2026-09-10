// Dataroom "request lists" (upload requests from visitors) are out of scope
// for this deployment, so the feature always reports itself as disabled.

export function useViewerRequestList(_args: {
  linkId?: string;
  dataroomId?: string;
  viewerId?: string;
  isPreview?: boolean;
}): { enabled: boolean } {
  return { enabled: false };
}
