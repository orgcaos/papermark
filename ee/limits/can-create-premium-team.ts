// Multi-team plan upgrades are out of scope for this single-user deployment,
// so nobody is ever eligible for a pre-provisioned premium team — new teams
// are always created on the plain default plan.

export const PREMIUM_TEAM_LIMIT = 0;

export async function getPremiumTeamEligibility(
  _userId: string,
): Promise<{ isPremiumAdmin: boolean; canCreate: boolean } | null> {
  return null;
}
