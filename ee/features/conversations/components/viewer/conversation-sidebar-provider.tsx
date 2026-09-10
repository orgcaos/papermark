import { type ReactNode } from "react";

// Document Q&A / conversations is out of scope for this deployment, so the
// sidebar this would normally manage is never actually shown — this just
// passes children through untouched and reports "closed" to any consumer.

export function ConversationSidebarProvider({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function ConversationSidebarLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function useConversationSidebarSafe(): { isOpen: boolean } | null {
  return null;
}
