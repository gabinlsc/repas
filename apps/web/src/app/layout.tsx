import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { ToastProvider } from "@mise/ui";
import { Providers } from "@/lib/trpc";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Mise — planificateur de repas", template: "%s · Mise" },
  description: "Plan de repas hebdomadaire, liste de courses intelligente et zéro gaspillage.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#1f6b4a" }, { media: "(prefers-color-scheme: dark)", color: "#12130f" }],
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Lire le nonce rend la page dynamique : Next l'applique alors à ses propres scripts.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        {/* Applique le thème choisi avant le rendu (évite le flash), signé par le nonce CSP. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: "try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}" }} />
      </head>
      <body>
        <a href="#main" className="skip-link">Aller au contenu</a>
        <Providers>
          <ToastProvider>{children}</ToastProvider>
        </Providers>
      </body>
    </html>
  );
}
