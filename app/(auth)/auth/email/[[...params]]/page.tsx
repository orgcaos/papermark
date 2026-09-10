import { Metadata } from "next";

import EmailVerificationClient from "./page-client";

const data = {
  description: "Verify your login to Orgcaos Docket",
  title: "Verify Login | Orgcaos Docket",
  url: "/auth/email",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://view.orgcaos.com"),
  title: data.title,
  description: data.description,
  openGraph: {
    title: data.title,
    description: data.description,
    url: data.url,
    siteName: "Orgcaos Docket",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: data.title,
    description: data.description,
  },
};

export default async function EmailVerificationPage() {
  return <EmailVerificationClient />;
}
