"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@mise/ui";
import { translator, type MessageKey } from "@/lib/i18n";

const t = translator();
const NAV: Array<{ href: string; key: MessageKey; icon: string }> = [
  { href: "/semaine", key: "nav.week", icon: "📅" },
  { href: "/recettes", key: "nav.recipes", icon: "📖" },
  { href: "/courses", key: "nav.shopping", icon: "🛒" },
  { href: "/stock", key: "nav.pantry", icon: "🥫" },
  { href: "/budget", key: "nav.budget", icon: "💶" },
  { href: "/reglages", key: "nav.settings", icon: "⚙️" },
];

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

export function AppShell({ children, userName }: { children: ReactNode; userName: string }) {
  const path = usePathname();
  const online = useOnline();
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);
  return (
    <div className="min-h-dvh pb-20 md:pb-0">
      <header className="no-print sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <Link href="/semaine" className="text-xl font-bold text-[var(--primary)]">Mise</Link>
          <nav aria-label="Navigation principale" className="hidden gap-1 md:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined} className={cn("rounded-lg px-3 py-2 text-sm", path.startsWith(n.href) ? "bg-[var(--surface-2)] font-semibold" : "hover:bg-[var(--surface-2)]")}>
                {t(n.key)}
              </Link>
            ))}
          </nav>
          <span className="text-sm text-[var(--text-muted)]">{userName}</span>
        </div>
        {!online ? <p role="status" className="bg-[var(--warning)] px-4 py-1 text-center text-sm text-black">{t("common.offline")}</p> : null}
      </header>
      <main id="main" className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      <nav aria-label="Navigation principale (mobile)" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-6 border-t border-[var(--border)] bg-[var(--surface)] md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path.startsWith(n.href) ? "page" : undefined} className={cn("flex min-h-14 flex-col items-center justify-center text-[11px]", path.startsWith(n.href) ? "font-semibold text-[var(--primary)]" : "text-[var(--text-muted)]")}>
            <span aria-hidden className="text-lg">{n.icon}</span>
            {t(n.key)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
