import { Metadata } from "next";

import RegisterClient from "./page-client";

const data = {
  description: "Signup to Orgcaos Docket",
  title: "Sign up | Orgcaos Docket",
  url: "/register",
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

export default function RegisterPage() {
  return <RegisterClient />;
}
