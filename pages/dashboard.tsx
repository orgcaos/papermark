import { useRouter } from "next/router";

import { useRef, useState } from "react";

import { useTeam } from "@/context/team-context";
import { addDays, format } from "date-fns";
import { FileTextIcon, LinkIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";

import { useEntryRedirect } from "@/lib/hooks/use-last-visited";
import { useMediaQuery } from "@/lib/utils/use-media-query";
import { usePlan } from "@/lib/swr/use-billing";
import { fetcher } from "@/lib/utils";

import { AnalyticsCard } from "@/components/analytics/analytics-card";
import DashboardViewsChart from "@/components/analytics/dashboard-views-chart";
import DocumentsTable from "@/components/analytics/documents-table";
import LinksTable from "@/components/analytics/links-table";
import { OverviewStatCards } from "@/components/analytics/overview-stat-cards";
import { RecentActivityCard } from "@/components/analytics/recent-activity-card";
import {
  DASHBOARD_TIME_RANGES,
  DashboardTimeRange,
  TimeRangeSelect,
  isDashboardTimeRange,
} from "@/components/analytics/time-range-select";
import { TopDocumentsCard } from "@/components/analytics/top-documents-card";
import ViewsTable from "@/components/analytics/views-table";
import VisitorsTable from "@/components/analytics/visitors-table";
import AppLayout from "@/components/layouts/app";
import { TabMenu } from "@/components/tab-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";

interface OverviewData {
  counts: {
    links: number;
    documents: number;
    visitors: number;
    views: number;
  };
  stats?: {
    totalDocuments: number;
    totalLinks: number;
    totalViews: number;
    views30d: number;
  };
  topDocuments?: {
    id: string;
    name: string;
    views: number;
    links: number;
  }[];
  recentActivity?: {
    id: string;
    viewerName: string | null;
    documentName: string;
    viewedAt: string;
    location: { city: string; country: string } | null;
  }[];
  graph: {
    date: string;
    views: number;
  }[];
  hasLinks?: boolean;
}
export const defaultRange = {
  start: addDays(new Date(), -30),
  end: addDays(new Date(), 0),
};

export default function DashboardPage() {
  const router = useRouter();
  // On platform entry, route the user back to where they last were (Option 2).
  const isRedirecting = useEntryRedirect();
  const teamInfo = useTeam();
  const { isMobile } = useMediaQuery();
  const { plan, trial } = usePlan();
  const slug = useRef<boolean>(false);
  const [customRange, setCustomRange] = useState<{
    start: Date;
    end: Date;
  }>(defaultRange);
  const [resetAllViewsOpen, setResetAllViewsOpen] = useState<boolean>(false);
  const [isResettingAllViews, setIsResettingAllViews] =
    useState<boolean>(false);

  // Check if user has access to data beyond 30 days
  const isPremium = plan !== "free" || !!trial;

  const {
    type = "links",
    start,
    end,
  } = router.query as {
    type: string;
    start: string;
    end: string;
  };

  // A hand-edited "?interval=all" would 400 against /api/analytics, so fall back to the default.
  const interval: DashboardTimeRange = isDashboardTimeRange(
    router.query.interval,
  )
    ? router.query.interval
    : isMobile
      ? "7d"
      : "30d";

  const {
    data: overview,
    isLoading,
    error,
  } = useSWR<OverviewData>(
    teamInfo?.currentTeam?.id
      ? `/api/analytics?type=overview&interval=${interval}&teamId=${teamInfo.currentTeam.id}${interval === "custom" ? `&startDate=${format(customRange.start, "MM-dd-yyyy")}&endDate=${format(customRange.end, "MM-dd-yyyy")}` : ""}`
      : null,
    fetcher,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
    },
  );

  if (error && !slug.current) {
    let errorMessage: string | undefined;
    try {
      errorMessage = JSON.parse(error.message)?.error;
    } catch {
      // error.message was not JSON (e.g. a 502/HTML error page) -- fall
      // through to the generic message below instead of crashing render.
    }
    toast.info(errorMessage ?? "Something went wrong loading your dashboard.");
    setCustomRange(defaultRange);
    slug.current = true;
  }

  // Update the URL when time range changes
  const handleTimeRangeChange = (newTimeRange: DashboardTimeRange) => {
    const params = new URLSearchParams(window.location.search);
    params.set("interval", newTimeRange);
    if (type) {
      params.set("type", type);
    }
    // Only remove date params when switching to preset ranges
    if (newTimeRange !== "custom") {
      params.delete("start");
      params.delete("end");
    }
    router.push(`/dashboard?${params.toString()}`, undefined, {
      shallow: true,
    });
  };

  // Handle custom range URL updates
  const handleCustomRangeComplete = (range: { start: Date; end: Date }) => {
    const params = new URLSearchParams(window.location.search);
    params.set("interval", "custom");
    params.set("start", range.start.toISOString());
    params.set("end", range.end.toISOString());
    if (type) {
      params.set("type", type);
    }
    router.push(`/dashboard?${params.toString()}`, undefined, {
      shallow: true,
    });
  };

  const handleResetAllViews = async () => {
    if (!teamInfo?.currentTeam?.id) return;
    setIsResettingAllViews(true);
    try {
      const res = await fetch(
        `/api/teams/${teamInfo.currentTeam.id}/views/reset`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.error || "Failed to reset views");
      }

      const { count } = await res.json();
      toast.success(
        count > 0
          ? `Reset ${count} view${count === 1 ? "" : "s"} across your team.`
          : "No views to reset.",
      );
      setResetAllViewsOpen(false);
      // Simplest reliable way to refresh every view-derived number on this
      // page (stat tiles, the chart, the tables below) after a bulk
      // archive -- they are spread across several SWR hooks/components.
      router.reload();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to reset views",
      );
    } finally {
      setIsResettingAllViews(false);
    }
  };

  const hasNoActivity =
    !isLoading && overview && overview.counts.views === 0;
  const hasLinks = overview?.hasLinks ?? false;
  const showEmptyOverlay = hasNoActivity && !hasLinks;
  const showSharePrompt = hasNoActivity && hasLinks;

  if (isRedirecting) {
    return (
      <AppLayout>
        <div className="flex h-[60vh] items-center justify-center">
          <LoadingSpinner className="h-6 w-6 text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex-1 space-y-4 p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold tracking-tight sm:text-3xl">Dashboard</h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setResetAllViewsOpen(true)}
          >
            <RotateCcwIcon className="mr-2 h-4 w-4" />
            Reset all views
          </Button>
        </div>

        <div className="relative space-y-4">
          <OverviewStatCards stats={overview?.stats} isLoading={isLoading} />

          <AnalyticsCard
            title="Views Overview"
            icon={
              <TimeRangeSelect
                value={interval}
                onChange={handleTimeRangeChange}
                ranges={DASHBOARD_TIME_RANGES}
                customRange={customRange}
                setCustomRange={setCustomRange}
                onCustomRangeComplete={handleCustomRangeComplete}
                slug={slug}
                isPremium={isPremium}
                compact
              />
            }
            contentClassName="space-y-4"
          >
            <div className="relative">
              <DashboardViewsChart
                timeRange={interval}
                data={overview?.graph}
                startDate={customRange.start}
                endDate={customRange.end}
              />
              {showSharePrompt && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="rounded-lg border bg-background/95 px-6 py-4 shadow-lg backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 text-center">
                      <LinkIcon className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm font-medium text-foreground">
                        Share access link to see activity
                      </p>
                      <p className="text-xs text-muted-foreground">
                        
                        Share your document or data room link with your audience
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </AnalyticsCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TopDocumentsCard
              documents={overview?.topDocuments}
              isLoading={isLoading}
              interval={interval}
            />
            <RecentActivityCard
              activity={overview?.recentActivity}
              isLoading={isLoading}
            />
          </div>

          {/* id target for TopDocumentsCard's "View all" link (and any other
              same-page tab switch) to scroll to -- without it, switching the
              `type` query param happened off-screen below the fold and felt
              like nothing had happened. */}
          <div id="dashboard-tabs">
            <TabMenu
              navigation={[
                {
                  label: "Links",
                  href: `/dashboard?interval=${interval}&type=links`,
                  value: "links",
                  currentValue: type,
                  count: overview?.counts.links,
                },
                {
                  label: "Documents",
                  href: `/dashboard?interval=${interval}&type=documents`,
                  value: "documents",
                  currentValue: type,
                  count: overview?.counts.documents,
                },
                {
                  label: "Visitors",
                  href: `/dashboard?interval=${interval}&type=visitors`,
                  value: "visitors",
                  currentValue: type,
                  count: overview?.counts.visitors,
                },
                {
                  label: "Recent Views",
                  href: `/dashboard?interval=${interval}&type=views`,
                  value: "views",
                  currentValue: type,
                  count: overview?.counts.views,
                },
              ]}
              className="z-10"
            />
          </div>

          <div className="grid grid-cols-1">
            {type === "links" && (
              <LinksTable
                startDate={customRange.start}
                endDate={customRange.end}
              />
            )}
            {type === "documents" && (
              <DocumentsTable
                startDate={customRange.start}
                endDate={customRange.end}
              />
            )}
            {type === "visitors" && (
              <VisitorsTable
                startDate={customRange.start}
                endDate={customRange.end}
              />
            )}
            {type === "views" && (
              <ViewsTable
                startDate={customRange.start}
                endDate={customRange.end}
              />
            )}
          </div>

          {showEmptyOverlay && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
              <div className="max-w-md rounded-xl border bg-background p-8 shadow-lg">
                <div className="flex flex-col items-center gap-4 text-center">
                  <div className="flex gap-3">
                    <div className="rounded-full border bg-muted p-3">
                      <FileTextIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="rounded-full border bg-muted p-3">
                      <LinkIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">
                      No activity yet
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Start sharing documents and data rooms to see visitor
                      activity and engagement analytics here.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={resetAllViewsOpen} onOpenChange={setResetAllViewsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all views for your team?</AlertDialogTitle>
            <AlertDialogDescription>
              This archives every view across all of your documents and
              links so they stop counting toward your analytics. It does
              not delete anything, and archived views can be restored
              later -- but every view count and chart on this dashboard
              will reset to zero.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isResettingAllViews}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                handleResetAllViews();
              }}
              disabled={isResettingAllViews}
            >
              {isResettingAllViews ? "Resetting..." : "Reset all views"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
