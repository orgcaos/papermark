import type { GetServerSideProps } from "next";

/**
 * This page used to hold Name/Email/Avatar. That content now lives on the
 * merged "User Account" tab at /settings/account (alongside Security,
 * Appearance and Log out - see pages/settings/account.tsx), per Savvas's
 * request, 2026-09-15. Rather than hunting down every hardcoded link to
 * /account/general across the app (the old sidebar-footer dropdown, emails,
 * breadcrumbs, mobile header), this route stays alive and just forwards to
 * the new page - same approach as the existing /settings/general redirect.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/settings/account",
      permanent: false,
    },
  };
};

export default function AccountGeneralRedirect() {
  return null;
}
