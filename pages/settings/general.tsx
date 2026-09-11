import type { GetServerSideProps } from "next";

/**
 * This page used to hold Team Name, Excel Advanced Mode, Replicate Dataroom
 * Folders, Analytics Timezone, Ignored Domains, the Global Block List, the
 * (SaaS-only) deal-type/deal-size survey, and Delete Team - none of which
 * are relevant to a single-tenant, single-user deployment. Rather than
 * hunting down every hardcoded link to /settings/general across the app
 * (sidebar, mobile menu, breadcrumbs, a couple of other settings pages),
 * this route stays alive and just forwards to Notifications, the closest
 * thing this deployment has to a meaningful "general settings" landing
 * page. See components/settings/settings-header.tsx and
 * components/sidebar/app-sidebar.tsx for where the "General"/"Overview"
 * nav entries themselves were removed.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/settings/notifications",
      permanent: false,
    },
  };
};

export default function GeneralSettingsRedirect() {
  return null;
}
