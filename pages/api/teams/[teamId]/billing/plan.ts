import { NextApiRequest, NextApiResponse } from "next";

import { getServerSession } from "next-auth/next";

import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/prisma";
import { CustomUser } from "@/lib/types";

// This fork has no real billing/Stripe subscriptions wired up. This route
// exists purely so the frontend's usePlan() hook (lib/swr/use-billing.ts),
// which calls GET /api/teams/[teamId]/billing/plan, gets a real response
// instead of a 404 -- it reads the team's `plan` field directly from the
// database and reports it as if it were a real (unpaid, non-expiring)
// subscription.
export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse,
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session) {
    return res.status(401).end("Unauthorized");
  }

  const { teamId } = req.query as { teamId: string };
  const userId = (session.user as CustomUser).id;

  try {
    const team = await prisma.team.findUnique({
      where: {
        id: teamId,
        users: {
          some: { userId },
        },
      },
      select: {
        plan: true,
      },
    });

    if (!team) {
      return res.status(404).json({ message: "Team not found" });
    }

    return res.status(200).json({
      plan: team.plan,
      startsAt: null,
      endsAt: null,
      pausedAt: null,
      pauseStartsAt: null,
      pauseEndsAt: null,
      isPaused: false,
      cancelledAt: null,
      trialEndsAt: null,
      isCustomer: false,
      subscriptionCycle: "monthly",
      discount: null,
    });
  } catch (error) {
    return res.status(500).json({ message: (error as Error).message });
  }
}
