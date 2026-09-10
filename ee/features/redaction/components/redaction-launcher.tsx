// Redaction is out of scope for this deployment, so the toolbar button that
// would launch it is simply not rendered.

export function RedactionLauncher(_props: {
  documentId: string;
  documentName: string;
  documentType?: string | null;
}) {
  return null;
}
