import Link from "next/link";
export const metadata = { title: "Hors ligne" };
export default function Offline() {
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold">Vous êtes hors ligne</h1>
      <p className="mt-3 text-[var(--text-muted)]">Le mode magasin reste disponible avec votre dernière liste.</p>
      <Link className="mt-6 inline-block font-medium text-[var(--primary)] underline" href="/courses/magasin">Ouvrir le mode magasin</Link>
    </main>
  );
}
