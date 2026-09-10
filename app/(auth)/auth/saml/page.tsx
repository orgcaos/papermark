import { Metadata } from "next";

import SAMLCallbackClient from "./page-client";

export const metadata: Metadata = {
  title: "SSO Login | Orgcaos Docket",
  description: "Completing SSO login",
};

export default function SAMLCallbackPage() {
  return <SAMLCallbackClient />;
}
