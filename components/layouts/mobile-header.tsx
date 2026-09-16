import Link from "next/link";
import { useRouter } from "next/router";

import { useState } from "react";

import { ChevronLeftIcon, MoreHorizontalIcon } from "lucide-react";

import { useDataroom } from "@/lib/swr/use-dataroom";

import { MobileMoreMenu } from "./mobile-more-menu";

export function MobileHeader() {
  const router = useRouter();
  const [moreOpen, setMoreOpen] = useState(false);

  const inDataroom =
    router.pathname.startsWith("/datarooms/[id]") && !!router.query.id;
  const { dataroom } = useDataroom();

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex flex-col border-b border-border bg-background pt-[env(safe-area-inset-top,0px)] md:hidden">
      <div className="flex h-14 shrink-0 touch-manipulation items-center justify-between gap-2 px-4">
        {inDataroom && dataroom?.name ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Link
              href="/datarooms"
              className="-ml-1 flex shrink-0 items-center justify-center rounded-md p-1 text-muted-foreground active:bg-muted"
              aria-label="Back to datarooms"
            >
              <ChevronLeftIcon className="h-5 w-5" />
            </Link>
            <p className="min-w-0 truncate text-base font-semibold tracking-tight text-foreground">
              {dataroom.name}
            </p>
          </div>
        ) : (
          <Link
            href="/dashboard"
            className="text-xl font-bold tracking-tighter text-foreground"
          >
            Orgcaos Docket
          </Link>
        )}

        {/* "More" used to live in the bottom nav; it moved up here (replacing
            the old avatar/account dropdown) so it's reachable from every
            screen without taking a bottom-nav slot. Settings, theme, and
            log out -- previously in that dropdown -- now live inside the
            More sheet itself (components/layouts/mobile-more-menu.tsx). */}
        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          aria-label="More"
          className="flex h-9 w-9 items-center justify-center rounded-full text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <MoreHorizontalIcon className="h-5 w-5" />
        </button>
      </div>

      <MobileMoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} />
    </header>
  );
}
