import { useRouter } from "next/router";

import { FolderIcon } from "lucide-react";

import { useTeam } from "@/context/team-context";

import { AddDocumentDropdown } from "@/components/documents/add-document-dropdown";
import { DocumentsList } from "@/components/documents/documents-list";
import AppLayout from "@/components/layouts/app";
import { Separator } from "@/components/ui/separator";

import { useFolder, useFolderDocuments } from "@/lib/swr/use-documents";

export default function DocumentTreePage() {
  const router = useRouter();
  const { name } = router.query as { name: string[] };

  const { folders, loading: foldersLoading } = useFolder({ name });
  const { documents, loading } = useFolderDocuments({ name });
  const teamInfo = useTeam();

  // This route is always inside a folder (the root listing lives at
  // /documents), so the last path segment is this folder's own name --
  // folder paths are materialized directly from folder names (see
  // pages/api/teams/[teamId]/folders/[...name].ts), so no separate
  // lookup is needed just to display it.
  const folderName = name?.[name.length - 1] ?? "Documents";

  return (
    <AppLayout>
      <main className="p-4 sm:m-4 sm:px-4 sm:py-4">
        {/* Styled like the document page's header (components/documents/document-header.tsx):
            icon + name + item-count subtitle on the left, actions on the right.
            Restyled 2026-09-15 per Savvas's request; folders don't have their own
            share links or versions the way documents do, so this shows what
            folders actually have -- subfolder/document counts -- rather than
            a share-links table. */}
        <header className="mb-4 mt-4 flex flex-col gap-y-4 md:mb-8 lg:mb-12">
          <div className="flex items-center justify-between gap-x-2 sm:gap-x-8">
            <div className="flex min-w-0 items-center space-x-2">
              <FolderIcon className="size-7 shrink-0 text-muted-foreground sm:size-8" />
              <div className="mt-1 flex min-w-0 flex-col lg:mt-0">
                <h2 className="min-w-0 truncate px-1 text-base font-semibold tracking-tight text-foreground lg:px-3 sm:text-lg lg:text-xl xl:text-2xl">
                  {folderName}
                </h2>
                {!foldersLoading && !loading && (
                  <div className="flex min-w-0 items-center gap-x-1.5 px-1 text-xs text-muted-foreground lg:px-3">
                    <span className="truncate">
                      {folders?.length ?? 0}{" "}
                      {folders?.length === 1 ? "folder" : "folders"}
                    </span>
                    <span aria-hidden>&middot;</span>
                    <span className="truncate">
                      {documents?.length ?? 0}{" "}
                      {documents?.length === 1 ? "document" : "documents"}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-x-2">
              <AddDocumentDropdown variant="split" />
            </div>
          </div>
        </header>

        {/* Portaled in from DocumentsList component */}
        <section id="documents-header-count" />

        <Separator className="mb-5 bg-gray-200 dark:bg-gray-800" />

        <DocumentsList
          documents={documents}
          folders={folders}
          teamInfo={teamInfo}
          folderPathName={name}
          loading={loading}
          foldersLoading={foldersLoading}
        />
      </main>
    </AppLayout>
  );
}
