import Link from "next/link";
import { useRouter } from "next/router";

import { useEffect, useState } from "react";

import {
  ChevronDownIcon,
  CogIcon,
  LogOutIcon,
  MonitorIcon,
  XIcon,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useTheme } from "next-themes";

import { useSelfMembership } from "@/lib/hooks/use-self-membership";
import { SETTINGS_NAV_ITEMS } from "@/lib/constants/settings-nav";
import { usePlan } from "@/lib/swr/use-billing";
import useLimits from "@/lib/swr/use-limits";
import { cn, nFormatter } from "@/lib/utils";

import Moon from "@/components/shared/icons/moon";
import Sun from "@/components/shared/icons/sun";
import { Progress } from "@/components/ui/progress";

interface MobileMoreMenuProps {
  open: boolean;
  onClose: () => void;
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: MonitorIcon },
] as const;

export function MobileMoreMenu({ open, onClose }: MobileMoreMenuProps) {
  const router = useRouter();
  const { isFree, isTrial } = usePlan();
  const { limits } = useLimits();
  const { theme, setTheme } = useTheme();
  // Scoped members can't reach team-wide areas (settings).
  const { isDataroomMember } = useSelfMembership();
  const [settingsExpanded, setSettingsExpanded] = useState(() =>
    router.pathname.includes("settings"),
  );

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  const linksLimit = limits?.links;
  const documentsLimit = limits?.documents;

  const settingsSubItems = SETTINGS_NAV_ITEMS;

  return (
    <div className="fixed inset-0 z-50 flex touch-manipulation flex-col bg-background pb-[env(safe-area-inset-bottom,0px)] pt-[env(safe-area-inset-top,0px)] [-webkit-tap-highlight-color:transparent] md:hidden">
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-lg font-semibold">More</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-4">
        {/* Theme -- previously the header's avatar dropdown had this via
            ModeToggle, which is built on Radix DropdownMenu primitives and
            can't be dropped into a plain sheet, so this is a standalone
            three-way switch instead. */}
        <div className="mb-4">
          <div className="mb-2 px-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Theme
          </div>
          <div className="flex gap-2">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setTheme(value)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-1 rounded-lg border border-border px-3 py-2.5 text-xs font-medium transition-colors",
                  theme === value
                    ? "border-foreground bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {!isDataroomMember && (
            /* Settings with expandable sub-items */
            <div>
              <button
                onClick={() => setSettingsExpanded((v) => !v)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors",
                  router.pathname.includes("settings")
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <CogIcon className="h-5 w-5" />
                Settings
                <ChevronDownIcon
                  className={cn(
                    "ml-auto h-4 w-4 transition-transform",
                    settingsExpanded && "rotate-180",
                  )}
                />
              </button>
              {settingsExpanded && (
                <div className="ml-8 mt-1 space-y-0.5 border-l border-border pl-3">
                  {settingsSubItems.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={onClose}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm transition-colors",
                        router.pathname.includes(
                          sub.href.replace("/settings/", "settings/"),
                        )
                          ? "font-medium text-foreground"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {sub.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {(linksLimit || documentsLimit) && (
          <div className="mt-6 space-y-3 rounded-lg border border-border p-4">
            <p className="text-xs font-medium text-muted-foreground">Usage</p>
            {linksLimit ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Links</span>
                  <span className="text-muted-foreground">
                    {nFormatter(limits?.usage?.links ?? 0)} /{" "}
                    {nFormatter(linksLimit)}
                  </span>
                </div>
                <Progress
                  value={
                    limits?.usage?.links
                      ? (limits.usage.links / linksLimit) * 100
                      : 0
                  }
                  className="h-1 bg-muted"
                  max={100}
                />
              </div>
            ) : null}
            {documentsLimit ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground">Documents</span>
                  <span className="text-muted-foreground">
                    {nFormatter(limits?.usage?.documents ?? 0)} /{" "}
                    {nFormatter(documentsLimit)}
                  </span>
                </div>
                <Progress
                  value={
                    limits?.usage?.documents
                      ? (limits.usage.documents / documentsLimit) * 100
                      : 0
                  }
                  className="h-1 bg-muted"
                  max={100}
                />
              </div>
            ) : null}
          </div>
        )}

        {isTrial && (
          <div className="mt-4">
            <Link
              href="/settings/billing/upgrade?view=business-datarooms"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Upgrade Plan
            </Link>
          </div>
        )}
        {isFree && !isTrial && (
          <div className="mt-4">
            <Link
              href="/settings/billing"
              onClick={onClose}
              className="flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Upgrade Papermark
            </Link>
          </div>
        )}

        {/* Log out -- previously in the header's avatar dropdown, now the
            last item here since that dropdown is gone. */}
        <div className="mt-4 border-t border-border pt-4">
          <button
            type="button"
            onClick={() =>
              signOut({ callbackUrl: `${window.location.origin}` })
            }
            className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOutIcon className="h-5 w-5" />
            Log out
          </button>
        </div>
      </div>
    </div>
  );
}
