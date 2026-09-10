"use client";

import Link from "next/link";
import { useRouter } from "next/router";

import { useEffect, useState } from "react";

import { motion } from "motion/react";

import { NavUser } from "@/components/sidebar/nav-user";
import { SidebarFooter, SidebarHeader } from "@/components/ui/sidebar";

import { AppSidebarContent } from "./app-sidebar";
import { DataroomSidebarContent } from "./dataroom-sidebar";

let lastKnownIsDataroom: boolean | null = null;

// This is a self-hosted, single-tenant deployment with no real billing --
// there's no plan/tier to show next to the brand name, so this is just the
// brand name/link, no plan badges.
function SidebarBrandHeader() {
  return (
    <SidebarHeader className="gap-y-0 pb-4">
      <p className="hidden w-full justify-center text-2xl font-bold tracking-tighter text-black group-data-[collapsible=icon]:inline-flex dark:text-white">
        <Link href="/dashboard">O</Link>
      </p>
      <p className="ml-2 flex items-center text-2xl font-bold tracking-tighter text-black group-data-[collapsible=icon]:hidden dark:text-white">
        <Link href="/dashboard">Orgcaos Docket</Link>
      </p>
    </SidebarHeader>
  );
}

export function SidebarPanels() {
  const router = useRouter();
  const isDataroom = router.pathname.startsWith("/datarooms/[id]");

  const [animDirection] = useState<"enter" | "leave" | null>(() => {
    if (lastKnownIsDataroom === null) return null;
    if (isDataroom && !lastKnownIsDataroom) return "enter";
    if (!isDataroom && lastKnownIsDataroom) return "leave";
    return null;
  });

  useEffect(() => {
    lastKnownIsDataroom = isDataroom;
  }, [isDataroom]);

  const [animating, setAnimating] = useState(animDirection !== null);

  if (animDirection) {
    return (
      <div className="flex h-full flex-col">
        <SidebarBrandHeader />
        <div
          className={`flex min-h-0 flex-1 flex-col ${animating ? "overflow-hidden" : ""}`}
        >
          <motion.div
            initial={{
              x: animDirection === "enter" ? "100%" : "-100%",
              opacity: 0,
            }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            onAnimationComplete={() => setAnimating(false)}
            className="flex min-h-0 flex-1 flex-col"
          >
            {isDataroom ? <DataroomSidebarContent /> : <AppSidebarContent />}
          </motion.div>
        </div>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SidebarBrandHeader />
      {isDataroom ? <DataroomSidebarContent /> : <AppSidebarContent />}
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
    </div>
  );
}
