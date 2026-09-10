import { z } from "zod";

import prisma from "@/lib/prisma";

// Real (non-enterprise) helpers for the RestrictedToken.subjectType column —
// this file just never existed upstream, it isn't a gated feature.

export const RestrictedTokenSubjectTypeSchema = z.enum(["user", "machine"]);
export type RestrictedTokenSubjectType = z.infer<
  typeof RestrictedTokenSubjectTypeSchema
>;

export function parseRestrictedTokenSubjectType(
  raw: string | null | undefined,
): RestrictedTokenSubjectType {
  const parsed = RestrictedTokenSubjectTypeSchema.safeParse(raw);
  return parsed.success ? parsed.data : "user";
}

/**
 * "user"-scoped API keys are meant to stop working once their owner loses
 * access to the team ("machine" keys stay team-scoped and survive). Delete
 * them here so removing a teammate actually revokes their personal keys.
 */
export async function revokeUserBoundTeamTokens(
  userId: string,
  teamId: string,
): Promise<void> {
  await prisma.restrictedToken.deleteMany({
    where: { userId, teamId, subjectType: "user" },
  });
}
