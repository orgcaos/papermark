import Link from "next/link";

import { Fragment, useMemo, useState } from "react";

import { AlertTriangleIcon, ChevronRightIcon } from "lucide-react";

import { usePlan } from "@/lib/swr/use-billing";
import { type ViewWithDuration, useLinkVisits } from "@/lib/swr/use-link";
import { cn, durationFormat, timeAgo } from "@/lib/utils";

import { Gauge } from "@/components/ui/gauge";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import { VisitorAvatar } from "@/components/visitors/visitor-avatar";
import VisitorUserAgent from "@/components/visitors/visitor-useragent";

// Wide enough for the links table with or without its Tags column.
const DETAIL_COLSPAN = 7;

function formatVisitDate(value: Date | string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LinksVisitors({
  linkId,
  linkName,
}: {
  linkId: string;
  linkName: string;
}) {
  const { views, hiddenFromPause } = useLinkVisits(linkId);
  const { isPaused } = usePlan();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // Visits on this link grouped by viewer email, oldest first, so each row
  // can say "visit 2 of 3" and list the same person's other visits.
  // Anonymous visits carry nothing that ties them to each other.
  const visitsByEmail = useMemo(() => {
    const groups = new Map<string, ViewWithDuration[]>();
    for (const view of views ?? []) {
      if (!view.viewerEmail) continue;
      const key = view.viewerEmail.toLowerCase();
      const list = groups.get(key) ?? [];
      list.push(view);
      groups.set(key, list);
    }
    groups.forEach((list) =>
      list.sort(
        (a, b) =>
          new Date(a.viewedAt).getTime() - new Date(b.viewedAt).getTime(),
      ),
    );
    return groups;
  }, [views]);

  const toggle = (viewId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(viewId)) next.delete(viewId);
      else next.add(viewId);
      return next;
    });

  return (
    <>
      {views && isPaused && hiddenFromPause > 0 && (
        <TableRow>
          <TableCell colSpan={5} className="text-left sm:text-center">
            <div className="flex flex-col items-start justify-center gap-2 sm:flex-row sm:items-center">
              <span className="flex items-center gap-x-1">
                <AlertTriangleIcon className="inline-block h-4 w-4 text-orange-500" />
                {hiddenFromPause} visit
                {hiddenFromPause !== 1 ? "s" : ""} occurred while your
                subscription was paused and{" "}
                {hiddenFromPause !== 1 ? "are" : "is"} hidden.
              </span>
              <Link
                href="/settings/billing"
                className="font-medium text-orange-600 underline hover:text-orange-700"
              >
                Unpause subscription to see all visits
              </Link>
            </div>
          </TableCell>
        </TableRow>
      )}
      {views ? (
        views.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={DETAIL_COLSPAN}
              className="text-sm text-muted-foreground"
            >
              No visits to {linkName} yet.
            </TableCell>
          </TableRow>
        ) : (
          views.map((view) => {
            const isOpen = expanded.has(view.id);
            const sameViewer = view.viewerEmail
              ? (visitsByEmail.get(view.viewerEmail.toLowerCase()) ?? [])
              : [];
            const visitIndex = sameViewer.findIndex((v) => v.id === view.id);

            return (
              <Fragment key={view.id}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => toggle(view.id)}
                  aria-expanded={isOpen}
                >
                  <TableCell colSpan={2}>
                    <div className="flex items-center gap-x-2 overflow-visible sm:gap-x-3">
                      <ChevronRightIcon
                        className={cn(
                          "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                          isOpen && "rotate-90",
                        )}
                        aria-hidden="true"
                      />
                      <VisitorAvatar
                        viewerEmail={view.viewerEmail}
                        className="h-7 w-7 text-xs md:h-8 md:w-8 md:text-sm"
                      />
                      <div className="min-w-0">
                        <p className="overflow-visible text-sm text-gray-800 dark:text-gray-200">
                          {view.viewerName || view.viewerEmail || "Anonymous"}
                        </p>
                        {sameViewer.length > 1 && visitIndex >= 0 ? (
                          <p className="text-xs text-muted-foreground">
                            Visit {visitIndex + 1} of {sameViewer.length}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div className="flex items-center space-x-2 md:space-x-4">
                      <div className="whitespace-nowrap text-sm text-muted-foreground">
                        {durationFormat(view.totalDuration)}
                      </div>

                      <div className="text-xs md:text-sm">
                        <Gauge
                          value={view.completionRate}
                          size={"small"}
                          showValue={true}
                        />
                      </div>
                    </div>
                  </TableCell>

                  <TableCell>
                    <div>
                      <time
                        className="truncate text-sm text-muted-foreground"
                        dateTime={new Date(view.viewedAt).toISOString()}
                      >
                        {timeAgo(view.viewedAt)}
                      </time>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell"></TableCell>
                </TableRow>

                {isOpen ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={DETAIL_COLSPAN}
                      className="bg-muted/30 px-4 py-4 sm:px-6"
                    >
                      <VisitDetails view={view} sameViewer={sameViewer} />
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })
        )
      ) : (
        <TableRow>
          <TableCell colSpan={2}>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-10 w-10 rounded-full" />
              <Skeleton className="h-6 w-[220px]" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-24" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-6 w-16" />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

function VisitDetails({
  view,
  sameViewer,
}: {
  view: ViewWithDuration;
  sameViewer: ViewWithDuration[];
}) {
  // Time per page, from the per-page durations the visits API already sends.
  const durationByPage = new Map<number, number>();
  for (const row of view.duration?.data ?? []) {
    const page = Number(row.pageNumber);
    if (!Number.isFinite(page) || page < 1) continue;
    durationByPage.set(
      page,
      (durationByPage.get(page) ?? 0) + row.sum_duration,
    );
  }
  const pagesSeen = Array.from(durationByPage.keys());
  const furthestPage = pagesSeen.length ? Math.max(...pagesSeen) : 0;
  const totalPages = Math.max(view.pagesTotal ?? 0, furthestPage);
  const longest = Math.max(0, ...Array.from(durationByPage.values()));
  const topPages = Array.from(durationByPage.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  const otherVisits = sameViewer.filter((v) => v.id !== view.id);

  return (
    <div className="grid gap-6 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <section className="min-w-0 space-y-3">
        <h4 className="font-medium text-foreground">Time on each page</h4>
        {totalPages > 0 && pagesSeen.length > 0 ? (
          <>
            <p className="text-muted-foreground">
              Saw {pagesSeen.length} of {totalPages} page
              {totalPages !== 1 ? "s" : ""} · got as far as page {furthestPage}{" "}
              · {durationFormat(view.totalDuration)} in total
            </p>
            <div
              className="flex h-12 items-end gap-px"
              role="img"
              aria-label={`Time spent on each of ${totalPages} pages`}
            >
              {Array.from({ length: totalPages }, (_, i) => {
                const page = i + 1;
                const ms = durationByPage.get(page) ?? 0;
                const height = ms
                  ? Math.max(8, Math.round((ms / longest) * 100))
                  : 0;
                return (
                  <div
                    key={page}
                    className="flex h-full min-w-[2px] flex-1 items-end"
                    title={
                      ms
                        ? `Page ${page}: ${durationFormat(ms)}`
                        : `Page ${page}: not opened`
                    }
                  >
                    <div
                      className={cn(
                        "w-full rounded-t-sm",
                        ms
                          ? "bg-gray-800 dark:bg-gray-200"
                          : "h-0.5 bg-gray-300 dark:bg-gray-700",
                      )}
                      style={ms ? { height: `${height}%` } : undefined}
                    />
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Page 1</span>
              <span>Page {totalPages}</span>
            </div>
            {topPages.length ? (
              <p className="text-muted-foreground">
                Most time on{" "}
                {topPages
                  .map(([page, ms]) => `page ${page} (${durationFormat(ms)})`)
                  .join(", ")}
                .
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-muted-foreground">
            No page-by-page timing was recorded for this visit.
          </p>
        )}
      </section>

      <section className="min-w-0 space-y-4">
        <div className="space-y-1">
          <h4 className="font-medium text-foreground">Device and location</h4>
          <div className="-ml-1.5 text-muted-foreground">
            <VisitorUserAgent
              viewId={view.id}
              documentId={view.documentId ?? undefined}
            />
          </div>
          <p className="text-muted-foreground">
            Opened {formatVisitDate(view.viewedAt)}
          </p>
        </div>

        <div className="space-y-1">
          <h4 className="font-medium text-foreground">Other visits</h4>
          {!view.viewerEmail ? (
            <p className="text-muted-foreground">
              This visitor didn&apos;t give an email, so their visits can&apos;t
              be matched up. A matching device and city on another visit is a
              good hint it&apos;s the same person.
            </p>
          ) : otherVisits.length === 0 ? (
            <p className="text-muted-foreground">
              First and only visit to this link so far.
            </p>
          ) : (
            <ul className="space-y-1">
              {sameViewer.map((v, i) => (
                <li
                  key={v.id}
                  className={cn(
                    "flex flex-wrap gap-x-2 text-muted-foreground",
                    v.id === view.id && "font-medium text-foreground",
                  )}
                >
                  <span>
                    {i + 1}. {formatVisitDate(v.viewedAt)}
                  </span>
                  <span>
                    · {durationFormat(v.totalDuration)} ·{" "}
                    {Number(v.completionRate)}%
                  </span>
                  {v.id === view.id ? <span>(this visit)</span> : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
