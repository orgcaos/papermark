import { customAlphabet } from "nanoid";

import prisma from "@/lib/prisma";
import { safeSlugify } from "@/lib/utils";

// Deliberately excludes visually ambiguous characters (0/o, 1/l/i) so a
// short link is easy to read aloud, retype, or tell apart from similar ones.
const SUFFIX_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const SUFFIX_LENGTH = 4;
const WIDE_SUFFIX_LENGTH = 8;
const MAX_BASE_LENGTH = 40;
const MAX_ATTEMPTS = 8;

const generateSuffix = customAlphabet(SUFFIX_ALPHABET, SUFFIX_LENGTH);

/**
 * Builds the human-readable part of a short share-link slug (e.g.
 * "services-book" in /l/services-book-a8k2). Takes candidates in priority
 * order -- typically the link's own name, then the document/dataroom it
 * points at -- and slugifies the first non-empty one. Always returns a
 * non-empty, URL-safe string (falls back to "share").
 */
export function buildShortSlugBase(
  ...candidates: (string | null | undefined)[]
): string {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const slug = safeSlugify(candidate).slice(0, MAX_BASE_LENGTH).replace(/-+$/, "");
    if (slug) return slug;
  }
  return "share";
}

/**
 * Generates a shortSlug (e.g. "services-book-a8k2") unique among
 * `Link.shortSlug` values, retrying with a fresh random suffix on the rare
 * collision. `base` should already be slugified (see buildShortSlugBase).
 *
 * Generated once at link creation -- callers should never regenerate this
 * for an existing link (e.g. on rename), since a shortSlug already shared
 * with someone must keep resolving.
 */
export async function generateUniqueShortSlug(base: string): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate = `${base}-${generateSuffix()}`;
    const existing = await prisma.link.findUnique({
      where: { shortSlug: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }

  // Astronomically unlikely (32^4 ~= 1M combinations per base), but never
  // loop forever -- widen the suffix instead of failing link creation.
  const wideSuffix = customAlphabet(SUFFIX_ALPHABET, WIDE_SUFFIX_LENGTH)();
  return `${base}-${wideSuffix}`;
}
