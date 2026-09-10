import { task } from "@trigger.dev/sdk";

// Converting non-PDF uploads (PowerPoint/Word/Keynote) to PDF is out of
// scope for this deployment — v1 only supports uploading PDFs directly, so
// this code path is never actually exercised. These tasks are defined (not
// just typed) so the trigger.dev generic usage at the call sites still
// type-checks correctly.

type ConvertFilesPayload = {
  documentId: string;
  documentVersionId: string;
  teamId: string;
};

export const convertFilesToPdfTask = task({
  id: "convert-files-to-pdf",
  run: async (_payload: ConvertFilesPayload): Promise<void> => {
    return;
  },
});

export const convertKeynoteToPdfTask = task({
  id: "convert-keynote-to-pdf",
  run: async (_payload: ConvertFilesPayload): Promise<void> => {
    return;
  },
});
