import type { GetServerSideProps } from "next";

/**
 * This page used to hold passkey registration/management. That content now
 * lives on the merged "User Account" tab at /settings/account (alongside
 * General, Appearance and Log out - see pages/settings/account.tsx), per
 * Savvas's request, 2026-09-15. Rather than hunting down every hardcoded
 * link to /account/security across the app, this route stays alive and just
 * forwards to the new page - same approach as the existing /settings/general
 * redirect.
 */
export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/settings/account",
      permanent: false,
    },
  };
};

export default function AccountSecurityRedirect() {
  return null;
}
