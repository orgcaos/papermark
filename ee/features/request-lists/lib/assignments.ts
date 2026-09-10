// Dataroom "request lists" are out of scope for this deployment, so no
// viewer is ever considered "assigned" to an upload task.

export function isViewerAssigned(
  _assignments: unknown,
  _viewer: {
    viewerId?: string | null;
    email?: string | null;
    linkId?: string;
    groupIds?: Set<string>;
  },
): boolean {
  return false;
}
