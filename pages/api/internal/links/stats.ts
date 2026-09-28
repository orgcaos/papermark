import { NextApiRequest, NextApiResponse } from "next";

import prisma from "@/lib/prisma";
import { getLinkDurationsBatch } from "@/lib/tinybird";

// Internal, server-to-server: engagement per link, for the Orgcaos CRM's
// Outbox ("opened the deck Wed 14:02 · 3 min") and Home ("Deck opened
// since last week: 3"). Same Bearer-token gate as the other internal routes.
//
// GET ?ids=a,b,c   (up to 200 link ids)
//  -> 200 { links: [{ linkId, views, firstViewedAt, lastViewedAt,
//                     totalDurationMs }] }
//
// Views (count, first, last) come from Postgres -- one grouped query.
// Time spent comes from Tinybird's page_views in ONE batched query
// (get_link_durations_batch); Tinybird's free tier caps queries per day, so
// this never fans out per link, and a Tinybird failure degrades to
// totalDurationMs: null rather than failing the call. Links with no views
// are returned with zeros so the caller can tell "not opened" from "unknown".
const MAX_IDS = 200;

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.status(405).json({ message: "Method Not Allowed" });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];
  if (token !== process.env.INTERNAL_API_KEY) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const raw = Array.isArray(req.query.ids)
    ? req.query.ids.join(",")
    : req.query.ids;
  const ids = Array.from(
    new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^[A-Za-z0-9_-]{1,64}$/.test(s)),
    ),
  ).slice(0, MAX_IDS);
  if (ids.length === 0) {
    res.status(200).json({ links: [] });
    return;
  }

  try {
    const grouped = await prisma.view.groupBy({
      by: ["linkId"],
      where: {
        linkId: { in: ids },
        isArchived: false,
        viewType: "DOCUMENT_VIEW",
      },
      _count: { _all: true },
      _min: { viewedAt: true },
      _max: { viewedAt: true },
    });
    const byLink = new Map(grouped.map((g) => [g.linkId, g]));

    // Only links that have views can have time on record.
    const durationByLink = new Map<string, number>();
    const viewedIds = ids.filter((id) => byLink.has(id));
    if (viewedIds.length > 0) {
      try {
        const durations = await getLinkDurationsBatch({
          linkIds: viewedIds.join(","),
          since: 0,
        });
        for (const row of durations.data ?? []) {
          durationByLink.set(row.linkId, row.sum_duration);
        }
      } catch (error) {
        console.error("internal/links/stats: Tinybird durations failed", error);
      }
    }

    const links = ids.map((linkId) => {
      const g = byLink.get(linkId);
      const views = g?._count._all ?? 0;
      return {
        linkId,
        views,
        firstViewedAt: g?._min.viewedAt ?? null,
        lastViewedAt: g?._max.viewedAt ?? null,
        totalDurationMs:
          views === 0
            ? 0
            : durationByLink.has(linkId)
              ? durationByLink.get(linkId)!
              : null,
      };
    });

    res.status(200).json({ links });
  } catch (error) {
    console.error("internal/links/stats failed", error);
    res.status(500).json({ message: "Failed to read link stats" });
  }
}
