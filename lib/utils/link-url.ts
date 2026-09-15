export function constructLinkUrl(link: {
  id: string;
  domainId?: string | null;
  domainSlug?: string | null;
  slug?: string | null;
  shortSlug?: string | null;
}) {
  if (link.domainId && link.domainSlug && link.slug) {
    return `https://${link.domainSlug}/${link.slug}`;
  }

  if (link.shortSlug) {
    return `${process.env.NEXT_PUBLIC_MARKETING_URL}/l/${link.shortSlug}`;
  }

  return `${process.env.NEXT_PUBLIC_MARKETING_URL}/view/${link.id}`;
}


