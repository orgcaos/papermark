import { NextApiRequest, NextApiResponse } from "next";

import { authOptions } from "@/pages/api/auth/[...nextauth]";
import { getServerSession } from "next-auth/next";

import { errorhandler } from "@/lib/errorHandler";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method === "PUT") {
    // PUT /api/teams/:teamId/views/reset
    // Bulk-archives views so they stop counting toward analytics, the same
    // effect the existing single-view "Archive view" action has (see
    // pages/api/teams/[teamId]/views/[id]/archive.ts) -- this is not a
    // delete, it's reversible, and every analytics query already filters
    // on isArchived: false, so archiving is enough to "reset" the numbers
    // without touching the underlying View rows or their related records.
    //
    // Body: { documentId?: string } -- when present, scopes the reset to
    // that one document's views; when absent, resets every view for the
    // whole team.
    const session = await getServerSession(req, res, authOptions);
    if (!session) {
      return res.status(401).end("Unauthorized");
    }

    const userId = (session.user as CustomUser).id;
    const { teamId } = req.query as { teamId: string };
    const { documentId } = req.body as { documentId?: string };

    try {
      const team = await prisma.team.findUnique({
        where: {
          id: teamId,
          users: { some: { userId } },
        },
      });

      if (!team) {
        return res.status(403).json({ error: "Unauthorized" });
      }

      if (documentId) {
        const document = await prisma.document.findUnique({
          where: { id: documentId, teamId },
          select: { id: true },
        });

        if (!document) {
          return res.status(404).json({ error: "Document not found" });
        }
      }

      const { count } = await prisma.view.updateMany({
        where: {
          teamId,
          isArchived: false,
          ...(documentId ? { documentId } : {}),
        },
        data: { isArchived: true },
      });

      return res.status(200).json({ count });
    } catch (error) {
      errorhandler(error, res);
    }
  }

  // We only allow PUT requests
  res.setHeader("Allow", ["PUT"]);
  return res.status(405).end(`Method ${req.method} Not Allowed`);
}
