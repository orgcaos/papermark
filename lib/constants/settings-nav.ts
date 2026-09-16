// The single source of truth for the Settings tab set. Used by both the
// desktop/shared tab bar (components/settings/settings-header.tsx) and the
// mobile "More > Settings" quick-list (components/layouts/mobile-more-menu.tsx)
// so the two can't drift apart the way they did before.
export const SETTINGS_NAV_ITEMS = [
  {
    label: "User Account",
    href: "/settings/account",
    segment: "account",
  },
  {
    label: "Domains",
    href: "/settings/domains",
    segment: "domains",
  },
  {
    label: "Tags",
    href: "/settings/tags",
    segment: "tags",
  },
  {
    label: "Agreements",
    href: "/settings/agreements",
    segment: "agreements",
  },
  {
    label: "Notifications",
    href: "/settings/notifications",
    segment: "notifications",
  },
] as const;
