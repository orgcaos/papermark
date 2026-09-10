import type { AppProps } from "next/app";
import { Inter } from "next/font/google";
import Head from "next/head";

import { TeamProvider } from "@/context/team-context";
import { UploadProgressProvider } from "@/context/upload-progress-context";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { NuqsAdapter } from "nuqs/adapters/next/pages";

import { EXCLUDED_PATHS } from "@/lib/constants";
import { useTrackLastVisited } from "@/lib/hooks/use-last-visited";

import { PostHogGroupSync } from "@/components/providers/posthog-group-sync";
import { PostHogCustomProvider } from "@/components/providers/posthog-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "@/styles/globals.css";

const inter = Inter({ subsets: ["latin"] });

function LastVisitedTracker() {
  useTrackLastVisited();
  return null;
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
  router,
}: AppProps<{ session: Session }>) {
  return (
    <>
      <Head>
        <title>Orgcaos Docket</title>
        <meta name="theme-color" content="#000000" key="theme-color" />
        <meta
          name="description"
          content="Orgcaos Docket -- document sharing and tracking."
          key="description"
        />
        <meta
          property="og:title"
          content="Orgcaos Docket"
          key="og-title"
        />
        <meta
          property="og:description"
          content="Orgcaos Docket -- document sharing and tracking."
          key="og-description"
        />
        <meta property="og:type" content="website" />
        <link rel="icon" href="/favicon.ico" key="favicon" />
      </Head>
      <SessionProvider session={session}>
        <PostHogCustomProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <NuqsAdapter>
              <main className={inter.className}>
                <Toaster closeButton />
                <TooltipProvider delayDuration={100}>
                  {EXCLUDED_PATHS.includes(router.pathname) ? (
                    <Component {...pageProps} />
                  ) : (
                    <TeamProvider>
                      <PostHogGroupSync />
                      <LastVisitedTracker />
                      <UploadProgressProvider>
                        <Component {...pageProps} />
                      </UploadProgressProvider>
                    </TeamProvider>
                  )}
                </TooltipProvider>
              </main>
            </NuqsAdapter>
          </ThemeProvider>
        </PostHogCustomProvider>
      </SessionProvider>
    </>
  );
}
