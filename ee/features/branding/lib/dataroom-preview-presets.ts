// Dataroom layout preview presets are out of scope for this deployment (used
// only by an internal demo page). The types here are the real shapes the
// demo page's shared viewer components (FolderCard, DocumentCard,
// ViewFolderTree) expect, even though no preview data is ever generated.

import { DataroomFolder } from "@prisma/client";

export interface PreviewDocumentVersion {
  id: string;
  type: string;
  versionNumber: number;
  hasPages: boolean;
  isVertical: boolean;
  updatedAt: Date;
  fileSize?: number | bigint | null;
}

export interface PreviewDocument {
  id: string;
  name: string;
  dataroomDocumentId: string;
  folderName: string | null;
  downloadOnly: boolean;
  canDownload: boolean;
  hierarchicalIndex: string | null;
  versions: PreviewDocumentVersion[];
}

export interface DataroomPreviewDataset {
  folders: DataroomFolder[];
  documents: PreviewDocument[];
}

export function getDataroomPreviewDataset(
  _preset?: unknown,
): DataroomPreviewDataset {
  return { folders: [], documents: [] };
}
