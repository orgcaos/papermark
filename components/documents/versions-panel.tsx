import Link from "next/link";

import { FileTextIcon } from "lucide-react";

import { useDocumentVersions } from "@/lib/swr/use-document";
import { cn } from "@/lib/utils";
import { ensureFileExtension } from "@/lib/utils/get-content-type";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Compact "Versions (N)" side panel shown next to the Links table on the
 * document page. Added 2026-09-15 per Savvas's request -- the version
 * history already existed in the database (every "Upload new version"
 * creates a DocumentVersion row) but was never surfaced anywhere in the UI
 * before this.
 *
 * Title moved outside the bordered box (2026-09-15) to match how
 * LinksTable titles "All links" -- as a plain heading + count badge sitting
 * above its own bordered box, not baked into the box as a header row. See
 * the `linksTableContent` / final return in components/links/links-table.tsx.
 */
export function VersionsPanel({
  documentId,
  documentName,
  className,
}: {
  documentId: string;
  documentName: string;
  className?: string;
}) {
  const { versions, loading } = useDocumentVersions(documentId);

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-2 flex w-full items-center gap-2 md:mb-4">
        <h2 className="m-0">Versions</h2>
        {typeof versions?.length === "number" && (
          <Badge variant="outline" className="text-muted-foreground">
            {versions.length}
          </Badge>
        )}
      </div>

      <div className="flex flex-col divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
        {loading ? (
          Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))
        ) : !versions || versions.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-muted-foreground">
            No versions yet
          </p>
        ) : (
          versions.map((version) => (
            <Link
              key={version.id}
              href={`/documents/${encodeURIComponent(documentId)}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50"
            >
              <FileTextIcon className="h-6 w-6 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <p className="truncate text-sm font-medium text-foreground">
                    {ensureFileExtension({
                      name: documentName,
                      contentType: version.contentType,
                      type: version.type,
                    })}
                  </p>
                  {version.isPrimary && (
                    <Badge
                      variant="preview"
                      className="shrink-0 px-1.5 py-0 text-[10px] font-medium"
                    >
                      current
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {typeof version.numPages === "number" &&
                    `${version.numPages} ${version.numPages === 1 ? "page" : "pages"} · `}
                  {new Date(version.createdAt).toISOString().slice(0, 10)}
                </p>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
