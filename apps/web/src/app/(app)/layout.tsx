import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { sessionFromCookieHeader } from "@/server/context";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await sessionFromCookieHeader((await cookies()).toString());
  if (!session) redirect("/connexion");
  return <AppShell userName={session.user.displayName}>{children}</AppShell>;
}
