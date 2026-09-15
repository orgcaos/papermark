import { DocumentStorageType } from "@prisma/client";
import z from "zod";

export type DocumentData = {
  name: string;
  key: string;
  storageType: DocumentStorageType;
  contentType: string | null; // actual file mime type
  supportedFileType: string; // papermark types: "pdf", "sheet", "docs", "slides", "map", "zip"
  fileSize: number | undefined; // file size in bytes
  numPages?: number;
  enableExcelAdvancedMode?: boolean;
};

export const createDocument = async ({
  documentData,
  teamId,
  numPages,
  folderPathName,
  createLink = false,
  token,
}: {
  documentData: DocumentData;
  teamId: string;
  numPages?: number;
  folderPathName?: string;
  createLink?: boolean;
  token?: string;
}) => {
  // create a document in the database with the blob url
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_BASE_URL}/api/teams/${teamId}/documents`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        name: documentData.name,
        url: documentData.key,
        storageType: documentData.storageType,
        numPages: numPages,
        folderPathName: folderPathName,
        type: documentData.supportedFileType,
        contentType: documentData.contentType,
        createLink: createLink,
        fileSize: documentData.fileSize,
      }),
    },
  );

  if (!response.ok) {
    // Same fix as createNewDocumentVersion() below: surface the server's
    // actual error message instead of `new Error(error)` on a parsed JSON
    // object, which stringifies to the unhelpful "[object Object]".
    let message = `HTTP error! status: ${response.status}`;
    try {
      const body = await response.json();
      const detail =
        body?.details && typeof body.details !== "string"
          ? JSON.stringify(body.details)
          : body?.details;
      message = [body?.error || body?.message, detail]
        .filter(Boolean)
        .join(": ") || message;
    } catch {
      // Response body wasn't JSON -- keep the status-code message.
    }
    throw new Error(message);
  }

  return response;
};

export const createAgreementDocument = async ({
  documentData,
  teamId,
  numPages,
  folderPathName,
}: {
  documentData: DocumentData;
  teamId: string;
  numPages?: number;
  folderPathName?: string;
}) => {
  // create a document in the database with the blob url
  const response = await fetch(`/api/teams/${teamId}/documents/agreement`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: documentData.name,
      url: documentData.key,
      storageType: documentData.storageType,
      numPages: numPages,
      folderPathName: folderPathName,
      type: documentData.supportedFileType,
      contentType: documentData.contentType,
      fileSize: documentData.fileSize,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  return response;
};

// create a new version in the database
export const createNewDocumentVersion = async ({
  documentData,
  documentId,
  teamId,
  numPages,
  token,
}: {
  documentData: DocumentData;
  documentId: string;
  teamId: string;
  numPages?: number;
  token?: string;
}) => {
  try {
    const documentIdParsed = z.string().cuid().parse(documentId);

    // Use absolute URL when a token is provided (server-side / webhook context),
    // otherwise use a relative URL (client-side context).
    const baseUrl = token ? process.env.NEXT_PUBLIC_BASE_URL : "";

    const response = await fetch(
      `${baseUrl}/api/teams/${teamId}/documents/${documentIdParsed}/versions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          url: documentData.key,
          storageType: documentData.storageType,
          numPages: numPages,
          type: documentData.supportedFileType,
          contentType: documentData.contentType,
          fileSize: documentData.fileSize,
        }),
      },
    );

    if (!response.ok) {
      // Surface the server's actual error message (e.g. Zod validation
      // details from documentUploadSchema, or "Internal Server Error: ...")
      // instead of a bare status code -- this is what add-document-modal.tsx
      // shows the user, and a bare "HTTP error! status: 400" gave no way to
      // tell a validation rejection apart from a server crash. Falls back to
      // the status code if the response isn't JSON for some reason.
      let message = `HTTP error! status: ${response.status}`;
      try {
        const body = await response.json();
        const detail =
          body?.details && typeof body.details !== "string"
            ? JSON.stringify(body.details)
            : body?.details;
        message = [body?.error || body?.message, detail]
          .filter(Boolean)
          .join(": ") || message;
      } catch {
        // Response body wasn't JSON -- keep the status-code message.
      }
      throw new Error(message);
    }

    return response;
  } catch (error) {
    console.error("Error creating new document version:", error);
    // Re-throw the original error (with its real message, per the block
    // above) instead of the previous hardcoded "Invalid document ID or team
    // ID" -- that message was wrong for anything other than an actual bad
    // documentId, and it swallowed every other real failure reason.
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Invalid document ID or team ID");
  }
};
