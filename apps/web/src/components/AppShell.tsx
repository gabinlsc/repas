"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { BookOpen, CalendarDays, CloudOff, PiggyBank, Refrigerator, Settings, ShoppingBasket } from "lucide-react";
import { Avatar, cn } from "@mise/ui";

const NAV = [
  { href: "/semaine", label: "Semaine", icon: CalendarDays },
  { href: "/recettes", label: "Recettes", icon: BookOpen },
  { href: "/courses", label: "Courses", icon: ShoppingBasket },
  { href: "/stock", label: "Stock", icon: Refrigerator },
  { href: "/budget", label: "Budget", icon: PiggyBank },
  { href: "/reglages", label: "Réglages", icon: Settings },
] as const;
const MOBILE = NAV.filter((n) => n.href !== "/budget");

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

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display text-2xl font-bold text-[var(--text)]", className)}>
      <span aria-hidden className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[var(--primary)] text-lg">🍲</span>
      Mise
    </span>
  );
}

export function AppShell({ children, userName }: { children: ReactNode; userName: string }) {
  const path = usePathname();
  const online = useOnline();
  const storeMode = path.startsWith("/courses/magasin");
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  }, []);
  const active = (href: string) => path === href || path.startsWith(`${href}/`) || (href === "/courses" && path.startsWith("/courses"));
  return (
    <div className="min-h-dvh md:grid md:grid-cols-[260px_1fr]">
      {/* Barre latérale (ordinateur) */}
      <aside className="no-print sticky top-0 hidden h-dvh flex-col gap-6 border-r border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-6 md:flex">
        <Link href="/semaine" className="px-2"><Logo /></Link>
        <nav aria-label="Navigation principale" className="flex flex-col gap-1">
          {NAV.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active(href) ? "page" : undefined}
              className={cn("flex min-h-11 items-center gap-3 rounded-full px-4 font-medium transition-colors", active(href) ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]")}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 rounded-[var(--radius)] bg-[var(--surface-2)] p-3">
          <Avatar name={userName} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{userName}</p>
            <Link href="/reglages" className="text-sm text-[var(--text-muted)] hover:underline">Mon foyer</Link>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Barre du haut (mobile) */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg)]/90 px-4 py-3 backdrop-blur md:hidden">
          <Link href="/semaine"><Logo className="text-xl" /></Link>
          <Link href="/budget" aria-label="Budget" className="rounded-full p-2 text-[var(--text-muted)] hover:bg-[var(--surface-2)]"><PiggyBank className="h-5 w-5" /></Link>
        </header>
        {!online ? (
          <p role="status" className="flex items-center justify-center gap-2 bg-[var(--warning-soft)] px-4 py-2 text-sm font-medium text-[var(--warning)]">
            <CloudOff className="h-4 w-4" aria-hidden /> Hors ligne — vos modifications seront synchronisées au retour du réseau.
          </p>
        ) : null}
        <main id="main" className={cn("mx-auto w-full max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-10", storeMode && "max-w-2xl")}>{children}</main>
      </div>

      {/* Barre d'onglets (mobile) */}
      <nav aria-label="Navigation principale (mobile)" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--bg-elevated)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} className={cn("flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-semibold", active(href) ? "text-[var(--primary)]" : "text-[var(--text-subtle)]")}>
            <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition-colors", active(href) && "bg-[var(--primary-soft)]")}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 text-sm font-semibold uppercase tracking-wider text-[var(--accent)]">{eyebrow}</p> : null}
        <h1 className="font-display text-3xl font-semibold leading-tight md:text-4xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-[var(--text-muted)]">{subtitle}</p> : null}
      </div>
      {actions ? <div className="no-print flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
