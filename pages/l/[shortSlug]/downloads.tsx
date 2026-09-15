import { GetServerSideProps } from "next";

import { Loader2 } from "lucide-react";

import {
  type ViewerI18nPageProps,
  buildViewerI18nPageProps,
} from "@/lib/i18n/viewer-page-props";
import prisma from "@/lib/prisma";

import { DownloadsPanel } from "@/components/view/dataroom/downloads-panel";
import { ViewerI18nProvider } from "@/components/view/viewer-i18n-provider";

// Pretty short-URL sibling of pages/view/[linkId]/downloads.tsx. The route
// param here is the link's shortSlug, but DownloadsPanel and its
// /api/links/download/* calls need the real link id -- resolved once below
// and passed through under the same `linkId` prop the panel already expects.
type Props = Partial<ViewerI18nPageProps> & { linkId: string | null };

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const shortSlug = context.params?.shortSlug as string;
  let link: {
    id: string;
    dataroom: { brand: { defaultLanguage: string | null } | null } | null;
  } | null = null;

  // Re-resolve the link's dataroom-brand default language so this page renders
  // in the same locale as the dataroom it was opened from.
  try {
    if (shortSlug) {
      link = await prisma.link.findUnique({
        where: { shortSlug },
        select: {
          id: true,
          dataroom: {
            select: { brand: { select: { defaultLanguage: true } } },
          },
        },
      });
    }
  } catch {
    link = null;
  }

  try {
    const i18nProps = await buildViewerI18nPageProps(
      link?.dataroom?.brand ?? null,
    );
    return { props: { linkId: link?.id ?? null, ...i18nProps } };
  } catch {
    return { props: { linkId: link?.id ?? null } };
  }
};

function ViewDownloadsPageInner({ linkId: linkIdProp }: Props) {
  const linkId = linkIdProp ?? undefined;

  if (!linkId) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <DownloadsPanel linkId={linkId} />;
}

export default function ViewDownloadsPage(props: Props) {
  const locale = props.i18n?.locale ?? "en";
  const resources = props.i18n?.resources ?? {};
  return (
    <ViewerI18nProvider locale={locale} resources={resources}>
      <ViewDownloadsPageInner {...props} />
    </ViewerI18nProvider>
  );
}
