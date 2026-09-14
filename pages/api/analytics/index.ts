import { NextApiRequest, NextApiResponse } from "next";

import { addDays } from "date-fns";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { enforceDataroomMemberScope } from "@/lib/api/rbac/guard";
import prisma from "@/lib/prisma";
import {
  getDocumentDurationsBatch,
  getLinkDurationsBatch,
  getPageDurationsBatch,
  getViewDurationsBatch,
  getViewUserAgent_v2,
} from "@/lib/tinybird/pipes";
import { CustomUser } from "@/lib/types";
import { durationFormat } from "@/lib/utils";

import { authOptions } from "../auth/[...nextauth]";

const analyticsQuerySchema = z.object({
  interval: z.enum(["24h", "7d", "30d", "custom"]),
  type: z.enum(["overview", "links", "documents", "visitors", "views"]),
  teamId: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const INTERVALS = {
  "24h": 24 * 60 * 60 * 1000, // 24 hours in ms
  "7d": 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  "30d": 30 * 24 * 60 * 60 * 1000, // 30 days in ms
} as const;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const result = analyticsQuerySchema.safeParse(req.query);

    if (!result.success) {
      return res
        .status(400)
        .json({ error: `Invalid body: ${result.error.message}` });
    }

    const {
      interval,
      type,
      teamId,
      startDate: startStr,
      endDate: endStr,
    } = result.data;

    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        users: {
          some: {
            userId: (session.user as CustomUser).id,
          },
        },
      },
      select: {
        id: true,
        plan: true,
        pauseStartsAt: true,
        timezone: true,
      },
    });

    if (!team) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Team-wide analytics is not part of the dataroom-scoped surface.
    const denied = await enforceDataroomMemberScope({
      userId: (session.user as CustomUser).id,
      teamId,
      res,
    });
    if (denied) return;

    // Get pause date filter if team is paused
    const pauseStartsAt = team.pauseStartsAt;
    // Get team timezone for analytics display (defaults to UTC)
    const timezone = team.timezone || "Etc/UTC";

    // Check if free plan user is trying to access data beyond 30 days
    if (interval === "custom" && team.plan.includes("free")) {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      thirtyDaysAgo.setHours(0, 0, 0, 0);

      // For custom range, check the provided start date
      if (startStr && new Date(startStr) < thirtyDaysAgo) {
        return res.status(401).json({
          error: "Free plan users can only access data from the last 30 days",
        });
      }
    }

    // get the start date for the interval
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (interval) {
      case "24h":
        // Get start of the hour 23 hours ago plus current hour = 24h
        startDate = new Date(now);
        startDate.setHours(startDate.getHours() - 23);
        startDate.setMinutes(0, 0, 0);
        break;
      case "7d":
        // Get start of the day 6 days ago plus current day = 7d
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "30d":
        // Get start of the day 29 days ago plus current day = 30d
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 29);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "custom":
        startDate = new Date(startStr || addDays(new Date(), -6));
        startDate.setHours(0, 0, 0, 0);
        endDate = new Date(endStr || now);

        if (startDate > endDate) {
          return res
            .status(400)
            .json({ error: "The 'From' date must be before the 'To' date." });
        }
        break;
      default:
        startDate = new Date(now);
        startDate.setDate(startDate.getDate() - 6);
    }

    // Create the interval filter for the query
    const intervalFilter: any = { gte: startDate, lte: endDate };

    let since: number;

    if (interval === "custom") {
      const startTimestamp = startStr ? new Date(startStr).getTime() : NaN;

      if (isNaN(startTimestamp)) {
        since = Date.now();
      } else {
        since = startTimestamp;
      }
    } else {
      since = Date.now() - INTERVALS[interval];
    }

    switch (type) {
      case "overview": {
        // All-time (not interval-scoped) view filter, respecting a pause date
        // the same way the rest of the analytics surface does.
        const allTimeViewFilter = pauseStartsAt
          ? { lt: pauseStartsAt }
          : undefined;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const [
          viewStats,
          graphData,
          linkCount,
          totalDocuments,
          totalViews,
          views30d,
          topDocumentViews,
          recentViews,
        ] = await Promise.all([
          prisma.view.findMany({
            where: {
              teamId,
              viewedAt: intervalFilter,
              isArchived: false,
              viewType: "DOCUMENT_VIEW",
            },
            select: {
              id: true,
              viewerEmail: true,
              linkId: true,
              documentId: true,
              viewerId: true,
            },
          }),
          // Note: We use timezone-aware date truncation to ensure dates are grouped
          // correctly based on the team's timezone setting, avoiding one-day offset issues
          interval === "24h"
            ? prisma.$queryRaw`
                SELECT 
                  DATE_TRUNC('hour', "viewedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as date,
                  COUNT(*) as views
                FROM "View"
                WHERE 
                  "teamId" = ${teamId}
                  AND "viewedAt" >= ${startDate}
                  AND "isArchived" = false
                  AND "viewType" = 'DOCUMENT_VIEW'
                GROUP BY 1
                ORDER BY date ASC
              `
            : interval === "custom"
              ? prisma.$queryRaw`
                SELECT 
                  DATE_TRUNC('day', "viewedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as date,
                  COUNT(*) as views
                FROM "View"
                WHERE 
                  "teamId" = ${teamId}
                  AND "viewedAt" >= ${startDate}
                  AND "viewedAt" <= ${endDate}
                  AND "isArchived" = false
                  AND "viewType" = 'DOCUMENT_VIEW'
                GROUP BY 1
                ORDER BY date ASC
              `
              : prisma.$queryRaw`
                SELECT 
                  DATE_TRUNC('day', "viewedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${timezone}) as date,
                  COUNT(*) as views
                FROM "View"
                WHERE 
                  "teamId" = ${teamId}
                  AND "viewedAt" >= ${startDate}
                  AND "isArchived" = false
                  AND "viewType" = 'DOCUMENT_VIEW'
                GROUP BY 1
                ORDER BY date ASC
              `,
          prisma.link.count({
            where: { teamId, deletedAt: null },
          }),
          // Total documents in the workspace (not just ones with views).
          prisma.document.count({ where: { teamId } }),
          // All-time view count, for the "Total Views" stat block.
          prisma.view.count({
            where: {
              teamId,
              isArchived: false,
              viewType: "DOCUMENT_VIEW",
              ...(allTimeViewFilter && { viewedAt: allTimeViewFilter }),
            },
          }),
          // Fixed last-30-days view count, independent of the interval
          // dropdown (which only drives the graph below).
          prisma.view.count({
            where: {
              teamId,
              isArchived: false,
              viewType: "DOCUMENT_VIEW",
              viewedAt: {
                gte: thirtyDaysAgo,
                ...(allTimeViewFilter ?? {}),
              },
            },
          }),
          // Top 5 documents by all-time view count, for the "Top documents" card.
          prisma.view.groupBy({
            by: ["documentId"],
            where: {
              teamId,
              isArchived: false,
              viewType: "DOCUMENT_VIEW",
              documentId: { not: null },
              ...(allTimeViewFilter && { viewedAt: allTimeViewFilter }),
            },
            _count: { id: true },
            orderBy: { _count: { id: "desc" } },
            take: 5,
          }),
          // Last 8 views team-wide, for the "Recent activity" card.
          prisma.view.findMany({
            where: {
              teamId,
              isArchived: false,
              viewType: "DOCUMENT_VIEW",
              ...(allTimeViewFilter && { viewedAt: allTimeViewFilter }),
            },
            orderBy: { viewedAt: "desc" },
            take: 8,
            select: {
              id: true,
              viewerName: true,
              viewerEmail: true,
              viewedAt: true,
              documentId: true,
              document: { select: { name: true } },
            },
          }),
        ]);

        const uniqueLinks = new Set(viewStats.map((view) => view.linkId));
        const uniqueDocuments = new Set(
          viewStats.map((view) => view.documentId),
        );
        const uniqueVisitors = new Set(viewStats.map((view) => view.viewerId));

        // Resolve names + non-deleted link counts for the top documents.
        const topDocumentIds = topDocumentViews
          .map((row) => row.documentId)
          .filter((id): id is string => !!id);
        const topDocumentDetails =
          topDocumentIds.length > 0
            ? await prisma.document.findMany({
                where: { id: { in: topDocumentIds }, teamId },
                select: {
                  id: true,
                  name: true,
                  _count: { select: { links: { where: { deletedAt: null } } } },
                },
              })
            : [];
        const topDocumentDetailsById = new Map(
          topDocumentDetails.map((doc) => [doc.id, doc]),
        );
        const topDocuments = topDocumentViews
          .map((row) => {
            const doc = row.documentId
              ? topDocumentDetailsById.get(row.documentId)
              : undefined;
            if (!doc) return null;
            return {
              id: doc.id,
              name: doc.name,
              views: row._count.id,
              links: doc._count.links,
            };
          })
          .filter((doc): doc is NonNullable<typeof doc> => !!doc);

        // Best-effort location lookup per recent view -- bounded to the small
        // fixed page size above, so this doesn't reintroduce the N+1 Tinybird
        // query problem the batched pipes were added to fix.
        const recentActivity = await Promise.all(
          recentViews.map(async (view) => {
            let location: { city: string; country: string } | null = null;
            if (view.documentId) {
              try {
                const userAgent = await getViewUserAgent_v2({
                  documentId: view.documentId,
                  viewId: view.id,
                  since: 0,
                });
                const row = userAgent.data?.[0];
                if (row?.city && row?.country && row.country !== "Unknown") {
                  location = { city: row.city, country: row.country };
                }
              } catch (error) {
                console.error(
                  "[overview] getViewUserAgent_v2 failed, omitting location",
                  error,
                );
              }
            }

            return {
              id: view.id,
              viewerName: view.viewerName || view.viewerEmail || null,
              documentName: view.document?.name ?? "Untitled document",
              viewedAt: view.viewedAt,
              location,
            };
          }),
        );

        return res.status(200).json({
          counts: {
            links: uniqueLinks.size,
            documents: uniqueDocuments.size,
            visitors: uniqueVisitors.size,
            views: viewStats.length,
          },
          stats: {
            totalDocuments,
            totalLinks: linkCount,
            totalViews,
            views30d,
          },
          topDocuments,
          recentActivity,
          graph: (graphData as { date: Date; views: bigint }[]).map(
            (point) => ({
              date: point.date,
              views: Number(point.views),
            }),
          ),
          timezone,
          hasLinks: linkCount > 0,
        });
      }

      case "links": {
        const links = await prisma.link.findMany({
          where: {
            teamId,
            views: {
              some: {
                viewedAt: intervalFilter,
                viewType: "DOCUMENT_VIEW",
                isArchived: false,
              },
            },
            deletedAt: null,
          },
          select: {
            id: true,
            name: true,
            slug: true,
            domainSlug: true,
            domainId: true,
            documentId: true,
            _count: {
              select: {
                views: {
                  where: {
                    viewedAt: intervalFilter,
                    viewType: "DOCUMENT_VIEW",
                    isArchived: false,
                  },
                },
              },
            },
            views: {
              where: {
                viewedAt: intervalFilter,
                viewType: "DOCUMENT_VIEW",
                isArchived: false,
              },
              orderBy: {
                viewedAt: "desc",
              },
              take: 1,
              select: {
                viewedAt: true,
              },
            },
            document: {
              select: {
                name: true,
                versions: {
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                  select: {
                    numPages: true,
                  },
                },
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // One batched Tinybird query for every link's duration, instead of
        // one query per link -- see getLinkDurationsBatch's comment.
        const linkIdsWithDoc = links
          .filter((link) => link.documentId)
          .map((link) => link.id);
        const linkDurationById = new Map<
          string,
          { sum_duration: number; view_count: number }
        >();
        if (linkIdsWithDoc.length > 0) {
          try {
            const durationData = await getLinkDurationsBatch({
              linkIds: linkIdsWithDoc.join(","),
              since,
            });
            for (const row of durationData.data ?? []) {
              linkDurationById.set(row.linkId, row);
            }
          } catch (error) {
            console.error("Error fetching Tinybird data:", error);
          }
        }

        // Transform the data to match the table requirements
        const transformedLinks = links.map((link) => {
          let avgDuration = "0s";
          const row = linkDurationById.get(link.id);
          if (row && row.view_count > 0) {
            avgDuration = durationFormat(row.sum_duration / row.view_count);
          }

          return {
            id: link.id,
            name: link.name || `Link #${link.id.slice(-5)}`,
            url: link.domainId
              ? `https://${link.domainSlug}/${link.slug}`
              : `${process.env.NEXT_PUBLIC_MARKETING_URL}/view/${link.id}`,
            documentName: link.document?.name || "Unknown",
            documentId: link.documentId,
            views: link._count.views,
            avgDuration,
            lastViewed: link.views[0]?.viewedAt || null,
          };
        });

        return res.status(200).json(transformedLinks);
      }

      case "documents": {
        const documents = await prisma.document.findMany({
          where: {
            teamId,
            views: {
              some: {
                viewedAt: intervalFilter,
                viewType: "DOCUMENT_VIEW",
                isArchived: false,
              },
            },
          },
          select: {
            id: true,
            name: true,
            _count: {
              select: {
                views: {
                  where: {
                    viewedAt: intervalFilter,
                    viewType: "DOCUMENT_VIEW",
                    isArchived: false,
                  },
                },
              },
            },
            views: {
              where: {
                viewedAt: intervalFilter,
                viewType: "DOCUMENT_VIEW",
                isArchived: false,
              },
              orderBy: {
                viewedAt: "desc",
              },
              take: 1,
              select: {
                viewedAt: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
        });

        // One batched Tinybird query for every document's duration,
        // instead of one query per document -- see
        // getDocumentDurationsBatch's comment.
        const documentDurationById = new Map<string, number>();
        if (documents.length > 0) {
          try {
            const durationData = await getDocumentDurationsBatch({
              documentIds: documents.map((doc) => doc.id).join(","),
              since,
            });
            for (const row of durationData.data ?? []) {
              documentDurationById.set(row.documentId, row.sum_duration);
            }
          } catch (error) {
            console.error("Error fetching Tinybird data:", error);
          }
        }

        // Transform the data to match the table requirements
        const transformedDocuments = documents.map((doc) => {
          let avgDuration = "0s";
          const totalDuration = documentDurationById.get(doc.id);
          if (totalDuration !== undefined && doc._count.views > 0) {
            avgDuration = durationFormat(totalDuration / doc._count.views);
          }

          return {
            id: doc.id,
            name: doc.name,
            views: doc._count.views,
            avgDuration,
            lastViewed: doc.views[0]?.viewedAt || null,
          };
        });

        return res.status(200).json(transformedDocuments);
      }

      case "visitors": {
        // Build interval filter that respects pause date
        // Use the earlier of endDate or pauseStartsAt as the effective upper bound
        const effectiveVisitorsEndDate =
          pauseStartsAt && pauseStartsAt < endDate ? pauseStartsAt : endDate;
        const visitorsIntervalFilter: any = {
          gte: startDate,
          ...(pauseStartsAt && pauseStartsAt < endDate
            ? { lt: effectiveVisitorsEndDate }
            : { lte: effectiveVisitorsEndDate }),
        };

        const viewers = await prisma.viewer.findMany({
          where: {
            teamId,
            views: {
              some: {
                viewedAt: visitorsIntervalFilter,
                isArchived: false,
                viewType: "DOCUMENT_VIEW",
              },
            },
          },
          include: {
            views: {
              orderBy: {
                viewedAt: "desc",
              },
              where: {
                viewType: "DOCUMENT_VIEW",
                viewedAt: visitorsIntervalFilter,
                isArchived: false,
              },
            },
          },
        });

        // Count hidden views from pause (clamp pauseStartsAt to startDate if it's earlier)
        const hiddenFromPause = pauseStartsAt
          ? await prisma.view.count({
              where: {
                teamId,
                viewedAt: {
                  gte: pauseStartsAt < startDate ? startDate : pauseStartsAt,
                  lte: endDate,
                },
                isArchived: false,
                viewType: "DOCUMENT_VIEW",
              },
            })
          : 0;

        // One batched Tinybird query for every viewer's views, instead of
        // one query per viewer -- see getViewDurationsBatch's comment.
        const allViewIds = viewers.flatMap((viewer) =>
          viewer.views.map((view) => view.id),
        );
        const viewDurationByViewId = new Map<string, number>();
        if (allViewIds.length > 0) {
          try {
            const durationData = await getViewDurationsBatch({
              viewIds: allViewIds.join(","),
              since,
            });
            for (const row of durationData.data ?? []) {
              viewDurationByViewId.set(row.viewId, row.sum_duration);
            }
          } catch (error) {
            console.error("Error fetching Tinybird data:", error);
          }
        }

        // Transform the data to match the table requirements
        const transformedVisitors = viewers.map((viewer) => {
          // Get unique documents viewed
          const uniqueDocuments = new Set(
            viewer.views.map((view) => view.documentId),
          );

          const totalDuration = viewer.views.reduce(
            (sum, view) => sum + (viewDurationByViewId.get(view.id) ?? 0),
            0,
          );

          // Get the name from the most recent view that has a name
          const viewerName = viewer.views.find(
            (v) => v.viewerName,
          )?.viewerName;

          return {
            email: viewer.email,
            viewerId: viewer.id,
            totalViews: viewer.views.length,
            lastActive: viewer.views[0]?.viewedAt || new Date(),
            uniqueDocuments: uniqueDocuments.size,
            verified: viewer.verified,
            totalDuration,
            viewerName: viewerName || null,
          };
        });

        return res.status(200).json({
          visitors: transformedVisitors,
          hiddenFromPause,
        });
      }

      case "views": {
        // Build interval filter that respects pause date
        // Use the earlier of endDate or pauseStartsAt as the effective upper bound
        const effectiveViewsEndDate =
          pauseStartsAt && pauseStartsAt < endDate ? pauseStartsAt : endDate;
        const viewsIntervalFilter: any = {
          gte: startDate,
          ...(pauseStartsAt && pauseStartsAt < endDate
            ? { lt: effectiveViewsEndDate }
            : { lte: effectiveViewsEndDate }),
        };

        const views = await prisma.view.findMany({
          where: {
            teamId,
            viewedAt: viewsIntervalFilter,
            isArchived: false,
            viewType: "DOCUMENT_VIEW",
          },
          include: {
            document: {
              select: {
                id: true,
                name: true,
                versions: {
                  orderBy: {
                    createdAt: "desc",
                  },
                  take: 1,
                  select: {
                    createdAt: true,
                    numPages: true,
                  },
                },
              },
            },
            link: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: {
            viewedAt: "desc",
          },
        });

        // Count hidden views from pause (clamp pauseStartsAt to startDate if it's earlier)
        const hiddenFromPause = pauseStartsAt
          ? await prisma.view.count({
              where: {
                teamId,
                viewedAt: {
                  gte: pauseStartsAt < startDate ? startDate : pauseStartsAt,
                  lte: endDate,
                },
                isArchived: false,
                viewType: "DOCUMENT_VIEW",
              },
            })
          : 0;

        // One batched Tinybird query for every view's per-page durations,
        // instead of one query per view -- see getPageDurationsBatch's
        // comment. Group the flat viewId+pageNumber rows back per view.
        const viewIdsWithDoc = views
          .filter((view) => view.document?.id)
          .map((view) => view.id);
        const pageRowsByViewId = new Map<
          string,
          { pageNumber: number; sum_duration: number }[]
        >();
        if (viewIdsWithDoc.length > 0) {
          try {
            const pageData = await getPageDurationsBatch({
              viewIds: viewIdsWithDoc.join(","),
              since,
            });
            for (const row of pageData.data ?? []) {
              const rows = pageRowsByViewId.get(row.viewId) ?? [];
              rows.push({
                pageNumber: Number(row.pageNumber),
                sum_duration: row.sum_duration,
              });
              pageRowsByViewId.set(row.viewId, rows);
            }
          } catch (error) {
            console.error("Error fetching Tinybird data:", error);
          }
        }

        // Transform the data to match the table requirements
        const transformedViews = views.map((view) => {
          let totalDuration = 0;
          let completionRate = 0;

          const pageRows = pageRowsByViewId.get(view.id);
          if (view.document?.id && pageRows && pageRows.length > 0) {
            // Calculate total duration from all pages
            totalDuration = pageRows.reduce(
              (sum, page) => sum + page.sum_duration,
              0,
            );

            // Calculate completion rate based on pages with any duration
            const numPages = view.document.versions[0]?.numPages || 0;
            completionRate = numPages
              ? (pageRows.length / numPages) * 100
              : 0;
          }

          return {
            id: view.id,
            viewerEmail: view.viewerEmail,
            documentName:
              view.document?.name ||
              `Document #${view.document?.id.slice(-5)}`,
            linkName: view.link?.name || `Link #${view.link?.id.slice(-5)}`,
            viewedAt: view.viewedAt,
            totalDuration,
            completionRate: Math.round(completionRate),
            verified: view.verified || false,
            documentId: view.document?.id,
            teamId,
          };
        });

        return res.status(200).json({
          views: transformedViews,
          hiddenFromPause,
        });
      }

      default: {
        return res.status(400).json({ error: "Invalid type" });
      }
    }
  } catch (error) {
    console.error(error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.issues });
    }
    return res.status(500).json({ error: "Internal server error" });
  }
}
