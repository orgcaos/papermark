"use client";

import Link from "next/link";

import { useSession } from "next-auth/react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavUser() {
  const { data: session } = useSession();

  // This used to be a dropdown (User Settings / Earn and Refer / Change
  // Theme / Log out) triggered by clicking the avatar+email. Per Savvas's
  // request (2026-09-15), it's now a single link straight into the merged
  // "User Account" settings tab (pages/settings/account.tsx), which is
  // where the name/email/avatar info shown here actually gets managed, and
  // where Change Theme, Log out and Earn and Refer now live instead.
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip="User Account">
          <Link href="/settings/account">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage
                src={session?.user?.image || ""}
                alt={session?.user?.name || ""}
              />
              <AvatarFallback className="rounded-lg">
                {session?.user?.name?.charAt(0) ||
                  session?.user?.email?.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">
                {session?.user?.name || ""}
              </span>
              <span className="truncate text-xs">
                {session?.user?.email || ""}
              </span>
            </div>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
