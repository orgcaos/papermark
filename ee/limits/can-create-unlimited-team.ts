// Multi-team plan upgrades are out of scope for this single-user deployment.

export async function canCreateUnlimitedTeam(_userId: string): Promise<boolean> {
  return false;
}
