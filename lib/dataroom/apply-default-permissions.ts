// Datarooms are out of scope for this deployment, so applying default
// per-viewer/per-link permissions when documents are attached to a dataroom
// is a safe no-op — this code path is unreachable since the app never
// creates datarooms.

export async function applyDataroomDocumentPermissionDefaults(_args: {
  dataroomId: string;
  dataroomDocuments: unknown;
  groupStrategy?: unknown;
  groupRootItemAccess?: unknown;
  linkStrategy?: unknown;
  linkRootItemAccess?: unknown;
}): Promise<void> {
  return;
}

export async function onDataroomDocumentsAttached(_args: {
  dataroomId: string;
  dataroomDocuments: { id: string; folderId: string | null }[];
  schedule?: (promise: Promise<unknown>) => void;
}): Promise<void> {
  return;
}
