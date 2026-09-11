import { cn } from "@/lib/utils";

import { Skeleton } from "@/components/ui/skeleton";

interface OverviewStatCardsProps {
  stats?: {
    totalDocuments: number;
    totalLinks: number;
    totalViews: number;
    views30d: number;
  };
  isLoading?: boolean;
}

const CARD_DEFS = [
  { key: "totalDocuments", label: "Documents" },
  { key: "totalLinks", label: "Share links" },
  { key: "totalViews", label: "Total views" },
  { key: "views30d", label: "Views (last 30 days)" },
] as const;

export function OverviewStatCards({
  stats,
  isLoading,
}: OverviewStatCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {CARD_DEFS.map(({ key, label }) => (
        <div
          key={key}
          className={cn(
            "rounded-xl border border-border bg-card px-5 py-4",
          )}
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {isLoading || !stats ? (
            <Skeleton className="mt-2 h-8 w-16" />
          ) : (
            <p className="mt-1 text-3xl font-bold tabular-nums">
              {stats[key].toLocaleString()}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
