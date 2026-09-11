import { format } from "date-fns";

import { AnalyticsCard } from "@/components/analytics/analytics-card";
import { Skeleton } from "@/components/ui/skeleton";

export interface RecentActivityItem {
  id: string;
  viewerName: string | null;
  documentName: string;
  viewedAt: string | Date;
  location: { city: string; country: string } | null;
}

interface RecentActivityCardProps {
  activity?: RecentActivityItem[];
  isLoading?: boolean;
}

export function RecentActivityCard({
  activity,
  isLoading,
}: RecentActivityCardProps) {
  return (
    <AnalyticsCard title="Recent activity" contentClassName="p-0">
      {isLoading || !activity ? (
        <div className="space-y-4 px-5 py-1">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : activity.length === 0 ? (
        <div className="flex h-24 items-center justify-center px-5 text-sm text-muted-foreground">
          No activity yet.
        </div>
      ) : (
        <ul>
          {activity.map((item) => (
            <li
              key={item.id}
              className="border-b border-border px-5 py-3 last:border-0"
            >
              <p className="truncate text-sm">
                <span className="font-medium">
                  {item.viewerName || "Someone"}
                </span>{" "}
                <span className="text-muted-foreground">opened</span>{" "}
                <span className="font-medium">{item.documentName}</span>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {item.location
                  ? `${item.location.city}, ${item.location.country} · `
                  : ""}
                {format(new Date(item.viewedAt), "MMM d, yyyy 'at' h:mm a")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AnalyticsCard>
  );
}
