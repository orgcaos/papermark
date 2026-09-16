import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { LIMITS } from "@/lib/constants";
import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { getDocumentWithTeamAndUser } from "@/lib/team/helper";
import {
  getPageDurationsBatch,
  getVideoEventsByDocument,
  getViewCompletionStats,
  getViewPageDuration,
} from "@/lib/tinybird";
import { CustomUser } from "@/lib/types";
import { log } from "@/lib/utils";
import {
  countablePlaybackEvents,
  completionRate,
  eventsForView,
  resolveVideoLength,
  watchTimeSeconds,
} from "@/lib/video-analytics/playback";

import { authOptions } from "../../../../auth/[...nextauth]";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "GET") {
    // GET /api/teams/:teamId/links/:id/visits
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    // get link id from query params
    const { teamId, id } = req.query as { teamId: string; id: string };

    const userId = (session.user as CustomUser).id;

    try {
      const teamAccess = await prisma.userTeam.findUnique({
        where: {
          userId_teamId: {
            userId: userId,
            teamId: teamId,
          },
        },
      });
      if (!teamAccess) {
        return res.status(401).end("Unauthorized");
      }

      // get the numPages from document
      const result = await prisma.link.findUnique({
        where: {
          id: id,
        },
        select: {
          deletedAt: true,
          document: {
            select: {
              id: true,
              numPages: true,
              type: true,
              versions: {
                select: {
                  versionNumber: true,
                  numPages: true,
                  isPrimary: true,
                  length: true,
                },
              },
              team: {
                select: {
                  id: true,
                  plan: true,
                  pauseStartsAt: true,
                  pauseEndsAt: true,
                },
              },
            },
          },
        },
      });

      // If link doesn't exist (deleted), return empty response
      if (!result || !result.document || result.deletedAt) {
        return res.status(200).json({ views: [], hiddenFromPause: 0 });
      }

      const docId = result.document.id;

      // check if the the team that own the document has the current user
      await getDocumentWithTeamAndUser({
        docId,
        userId,
        options: {
          team: {
            select: {
              users: {
                select: {
                  userId: true,
                },
              },
            },
          },
        },
      });

      const primaryVersion =
        result.document.versions.find((v) => v.isPrimary) ??
        result.document.versions[0];

      const currentDocNumPages =
        primaryVersion?.numPages || result?.document?.numPages || 0;

      const pauseStartsAt = result?.document?.team?.pauseStartsAt;
      const pauseEndsAt = result?.document?.team?.pauseEndsAt;

      const allViews = await prisma.view.findMany({
        where: {
          linkId: id,
          teamId: teamId,
        },
        orderBy: {
          viewedAt: "desc",
        },
      });

      // Filter out views that occurred during the pause period and count hidden views
      let hiddenFromPause = 0;
      const views =
        pauseStartsAt && pauseEndsAt
          ? allViews.filter((view) => {
              const viewedAt = new Date(view.viewedAt);
              const isDuringPause =
                viewedAt >= pauseStartsAt && viewedAt <= pauseEndsAt;
              if (isDuringPause) {
                hiddenFromPause++;
              }
              return !isDuringPause;
            })
          : allViews;

      // limit the number of views to 20 on free plan
      const limitedViews =
        result?.document?.team?.plan === "free"
          ? views.slice(0, LIMITS.views)
          : views;

      // A link can be transferred between documents over its lifetime, and a
      // single document can also be replaced with a new version that has a
      // different page count. So a historical view's completion rate has to
      // be computed against the specific version that was actually viewed
      // (resolved from Tinybird's per-page-view versionNumber), not against
      // whatever version happens to be primary/current today -- otherwise a
      // view of a 76-page v1 shows as e.g. 1500% once a 1-page v2 becomes
      // current.
      const otherDocumentIds = Array.from(
        new Set(
          limitedViews
            .map((view) => view.documentId)
            .filter(
              (docId): docId is string =>
                !!docId && docId !== result?.document?.id,
            ),
        ),
      );

      // documentId -> versionNumber -> numPages for that exact version.
      const numPagesByDocumentVersion = new Map<
        string,
        Map<number, number>
      >();
      // documentId -> numPages of its current/primary version, used as a
      // fallback when a view's version can't be resolved from Tinybird.
      const currentNumPagesByDocumentId = new Map<string, number>();

      const indexVersions = (
        indexDocId: string,
        versions: { versionNumber: number; numPages: number | null }[],
      ) => {
        const versionMap = new Map<number, number>();
        for (const v of versions) {
          versionMap.set(v.versionNumber, v.numPages || 0);
        }
        numPagesByDocumentVersion.set(indexDocId, versionMap);
      };

      indexVersions(result.document.id, result.document.versions);
      currentNumPagesByDocumentId.set(result.document.id, currentDocNumPages);

      if (otherDocumentIds.length > 0) {
        const otherDocuments = await prisma.document.findMany({
          where: { id: { in: otherDocumentIds }, teamId },
          select: {
            id: true,
            numPages: true,
            versions: {
              select: {
                versionNumber: true,
                numPages: true,
                isPrimary: true,
              },
            },
          },
        });
        for (const doc of otherDocuments) {
          indexVersions(doc.id, doc.versions);
          const docPrimaryVersion =
            doc.versions.find((v) => v.isPrimary) ?? doc.versions[0];
          currentNumPagesByDocumentId.set(
            doc.id,
            docPrimaryVersion?.numPages || doc.numPages || 0,
          );
        }
      }

      // viewId -> { versionNumber, pagesViewed }, resolved per document from
      // Tinybird. get_view_completion_stats groups page views by
      // viewId+versionNumber (unlike get_page_durations_batch below, which
      // only groups by pageNumber and can't tell versions apart).
      const completionByViewId = new Map<
        string,
        { versionNumber: number; pagesViewed: number }
      >();
      try {
        const completionDocumentIds = Array.from(
          new Set([result.document.id, ...otherDocumentIds]),
        );
        const completionResults = await Promise.all(
          completionDocumentIds.map((completionDocId) =>
            getViewCompletionStats({
              documentId: completionDocId,
              excludedViewIds: "",
              since: 0,
            }),
          ),
        );
        for (const completionResult of completionResults) {
          for (const row of completionResult.data ?? []) {
            completionByViewId.set(row.viewId, {
              versionNumber: row.versionNumber,
              pagesViewed: row.pages_viewed,
            });
          }
        }
      } catch (error) {
        // If this pipe isn't available, fall back to the (less accurate)
        // current-version page-count comparison further down rather than
        // failing the whole request -- same fallback philosophy as
        // getPageDurationsBatch below.
        console.error(
          "[visits] getViewCompletionStats failed, falling back to current-version page counts",
          error,
        );
      }

      const isVideo = result.document.type === "video";
      let viewsWithDuration;

      if (isVideo) {
        const videoEvents = await getVideoEventsByDocument({
          document_id: docId,
        });
        const countable = countablePlaybackEvents(videoEvents?.data);
        const videoLength = resolveVideoLength(
          primaryVersion?.length,
          countable,
        );

        viewsWithDuration = limitedViews.map((view) => {
          const { total, unique } = watchTimeSeconds(
            eventsForView(countable, view.id),
          );
          return {
            ...view,
            duration: { data: [] },
            totalDuration: total * 1000,
            completionRate: completionRate(unique, videoLength).toFixed(),
          };
        });
      } else {
        // One batched Tinybird query for every view on this link, instead of
        // one query per view -- see getPageDurationsBatch's comment in
        // lib/tinybird/pipes.ts.
        const pageRowsByViewId = new Map<
          string,
          { pageNumber: number; sum_duration: number }[]
        >();
        if (limitedViews.length > 0) {
          try {
            const pageData = await getPageDurationsBatch({
              viewIds: limitedViews.map((view) => view.id).join(","),
              since: 0,
            });
            for (const row of pageData.data ?? []) {
              const rows = pageRowsByViewId.get(row.viewId) ?? [];
              rows.push({ pageNumber: Number(row.pageNumber), sum_duration: row.sum_duration });
              pageRowsByViewId.set(row.viewId, rows);
            }
          } catch (error) {
            // The batched pipe (get_page_durations_batch) has to be pushed to
            // Tinybird separately from a normal code deploy (`tb push`). If
            // that was never done, or the pipe is temporarily unavailable,
            // fall back to the original one-query-per-view lookup instead of
            // failing the whole request.
            console.error(
              "[visits] getPageDurationsBatch failed, falling back to per-view lookups",
              error,
            );
            const fallbackResults = await Promise.all(
              limitedViews.map((view) =>
                getViewPageDuration({
                  documentId: view.documentId!,
                  viewId: view.id,
                  since: 0,
                }),
              ),
            );
            limitedViews.forEach((view, index) => {
              const rows = (fallbackResults[index].data ?? []).map((d) => ({
                pageNumber: Number(d.pageNumber),
                sum_duration: d.sum_duration,
              }));
              pageRowsByViewId.set(view.id, rows);
            });
          }
        }

        viewsWithDuration = limitedViews.map((view) => {
          const pageRows = pageRowsByViewId.get(view.id) ?? [];
          const totalDuration = pageRows.reduce(
            (sum, data) => sum + data.sum_duration,
            0,
          );

          const completionStat = completionByViewId.get(view.id);
          let viewCompletion: number;
          if (completionStat && view.documentId) {
            const numPages =
              numPagesByDocumentVersion
                .get(view.documentId)
                ?.get(completionStat.versionNumber) ?? 0;
            viewCompletion = numPages
              ? (completionStat.pagesViewed / numPages) * 100
              : 0;
          } else {
            // Tinybird completion stats weren't available for this view --
            // fall back to comparing against the viewed document's current
            // page count. Less accurate across version changes, but better
            // than failing outright.
            const viewNumPages = view.documentId
              ? (currentNumPagesByDocumentId.get(view.documentId) ??
                currentDocNumPages)
              : currentDocNumPages;
            viewCompletion = viewNumPages
              ? (pageRows.length / viewNumPages) * 100
              : 0;
          }
          // A view can't have completed more than 100% of the document it
          // actually viewed -- clamp defensively regardless of source.
          viewCompletion = Math.min(100, Math.max(0, viewCompletion));

          return {
            ...view,
            duration: { data: pageRows },
            totalDuration,
            completionRate: viewCompletion.toFixed(),
          };
        });
      }

      // TODO: Check that the user is owner of the links, otherwise return 401

      return res.status(200).json({
        views: viewsWithDuration,
        hiddenFromPause,
      });
    } catch (error) {
      log({
        message: `Failed to get views for link: _${id}_. \n\n ${error} \n\n*Metadata*: \`{userId: ${userId}}\``,
        type: "error",
      });
      errorhandler(error, res);
    }
  } else {
    // We only allow GET requests
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
