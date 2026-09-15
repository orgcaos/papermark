import Link from "next/link";

import { AnalyticsCard } from "@/components/analytics/analytics-card";
import { Skeleton } from "@/components/ui/skeleton";

export interface TopDocument {
  id: string;
  name: string;
  views: number;
  links: number;
}

interface TopDocumentsCardProps {
  documents?: TopDocument[];
  isLoading?: boolean;
  interval: string;
}

export function TopDocumentsCard({
  documents,
  isLoading,
  interval,
}: TopDocumentsCardProps) {
  return (
    <AnalyticsCard
      title="Top documents"
      icon={
        // Hash anchor so this actually scrolls the (now-selected) Documents
        // tab into view instead of just changing the query string while the
        // page stays put -- previously felt like a dead link, since the
        // table this switches to is further down the page. See the
        // id="dashboard-tabs" wrapper around <TabMenu /> in pages/dashboard.tsx.
        <Link
          href={`/dashboard?interval=${interval}&type=documents#dashboard-tabs`}
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          View all &rarr;
        </Link>
      }
      contentClassName="p-0"
    >
      {isLoading || !documents ? (
        <div className="space-y-4 px-5 py-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : documents.length === 0 ? (
        <div className="flex h-24 items-center justify-center px-5 text-sm text-muted-foreground">
          No views yet. Try sharing a link.
        </div>
      ) : (
        <ul>
          {documents.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-4 border-b border-border px-5 py-3 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{doc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {doc.links} {doc.links === 1 ? "link" : "links"}
                </p>
              </div>
              <span className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">
                {doc.views.toLocaleString()} views
              </span>
            </li>
          ))}
        </ul>
      )}
    </AnalyticsCard>
  );
}
