"use client";

import Link from "next/link";

import { SettingsIcon } from "lucide-react";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export function NavUser() {
  // This used to show the avatar/name/email, linking into the merged "User
  // Account" settings tab (pages/settings/account.tsx). Per Savvas's request
  // (2026-09-15), the email display felt redundant here, so this is now a
  // plain "Settings" entry with a gear icon instead, keeping the same link.
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild tooltip="Settings">
          <Link href="/settings/account">
            <SettingsIcon className="h-5 w-5 shrink-0" />
            <span className="truncate text-sm font-medium">Settings</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
