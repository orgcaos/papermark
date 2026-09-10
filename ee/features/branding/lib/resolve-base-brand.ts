// Custom team/dataroom branding is out of scope for this deployment (default
// Papermark branding is used everywhere), so every helper here safely
// resolves to "no brand" instead of reimplementing the upstream enterprise
// branding subsystem. The return types are still the real Brand shape (not
// a bare null literal) so callers that read fields off an existing brand
// under a feature-flag branch keep type-checking correctly.

import { Brand } from "@prisma/client";

export const teamBrandOgSelect = { id: true } as const;
export const teamBrandViewerSelect = { id: true } as const;
export const teamBrandWorkflowSelect = { id: true } as const;

export async function resolveBaseBrand(
  _args: Record<string, unknown>,
): Promise<Brand | null> {
  return null;
}

export async function findDefaultBrand(
  _teamId: string,
): Promise<Brand | null> {
  return null;
}

export async function persistDefaultBrand(
  _args: Record<string, unknown>,
): Promise<Brand | null> {
  return null;
}

export async function resolveDefaultBrandId(
  _teamId: string,
): Promise<string | null> {
  return null;
}

export async function resolveOwnedBrandId(
  _teamId: string,
  _requestedBrandId?: string | null,
): Promise<string | null> {
  return null;
}
