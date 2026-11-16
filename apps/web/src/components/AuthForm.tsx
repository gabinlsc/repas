"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Lock, Mail, Sparkles, User } from "lucide-react";
import { Button, Field, Input } from "@mise/ui";
import { Logo } from "@/components/AppShell";
import { useTRPC } from "@/lib/trpc";

const BENEFITS = [
  { emoji: "🗓️", title: "Ta semaine en 10 secondes", text: "Petits-déj, déjeuners, dîners : variés, de saison, adaptés à ton temps." },
  { emoji: "🛒", title: "Une liste de courses qui pense pour toi", text: "Quantités fusionnées, vrais paquets du magasin, rangée par rayon." },
  { emoji: "🌱", title: "Zéro gaspillage", text: "Ce qui traîne au frigo passe en priorité, les allergies jamais." },
];
const FLOAT = ["🍝", "🥗", "🍛", "🥞", "🍲", "🍓", "🥖", "🧀", "🍳"];

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const login = useMutation(trpc.auth.login.mutationOptions({ onSuccess: () => router.replace("/semaine") }));
  const register = useMutation(trpc.auth.register.mutationOptions({ onSuccess: () => router.replace("/onboarding") }));
  const m = mode === "login" ? login : register;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") login.mutate({ email, password });
    else register.mutate({ email, password, displayName: name });
  };
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section aria-hidden={false} className="relative hidden overflow-hidden bg-[var(--primary)] p-12 text-[#f8f4ec] lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute inset-0 opacity-[0.13]" aria-hidden>
          {FLOAT.map((e, i) => (
            <span key={e} className="absolute text-7xl" style={{ left: `${(i * 37) % 90}%`, top: `${(i * 53 + 10) % 85}%`, transform: `rotate(${(i % 3) * 12 - 12}deg)` }}>{e}</span>
          ))}
        </div>
        <span className="relative inline-flex items-center gap-2 font-display text-3xl font-bold">
          <span aria-hidden className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#f8f4ec] text-xl">🍲</span>Mise
        </span>
        <div className="relative max-w-lg">
          <p className="font-display text-5xl font-semibold leading-[1.05]">Dis-moi ton budget, je m&apos;occupe de la semaine.</p>
          <ul className="mt-10 flex flex-col gap-6">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex gap-4">
                <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-2xl">{b.emoji}</span>
                <div>
                  <p className="text-lg font-semibold">{b.title}</p>
                  <p className="text-[#d9eadf]">{b.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-[#cfe3d6]">360 recettes françaises et du monde · fonctionne hors ligne en magasin</p>
      </section>

      <main id="main" className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden"><Logo /></div>
          <h1 className="font-display text-3xl font-semibold">{mode === "login" ? "Bon retour 👋" : "Créons ton foyer"}</h1>
          <p className="mt-2 text-[var(--text-muted)]">{mode === "login" ? "Connecte-toi pour retrouver ta semaine." : "Moins d'une minute, et ta première semaine est prête."}</p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
            {mode === "register" ? (
              <Field label="Prénom" htmlFor="name">
                <Input id="name" icon={<User className="h-5 w-5" />} autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Camille" />
              </Field>
            ) : null}
            <Field label="E-mail" htmlFor="email">
              <Input id="email" icon={<Mail className="h-5 w-5" />} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.fr" />
            </Field>
            <Field label="Mot de passe" htmlFor="password" hint={mode === "register" ? "10 caractères minimum" : undefined}>
              <Input id="password" icon={<Lock className="h-5 w-5" />} type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {m.error ? <p role="alert" className="rounded-[var(--radius-sm)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">{m.error.message}</p> : null}
            <Button type="submit" size="lg" loading={m.isPending} icon={mode === "register" ? <Sparkles className="h-5 w-5" /> : undefined}>
              {mode === "login" ? "Se connecter" : "Créer un compte"}
            </Button>
          </form>
          <p className="mt-8 text-center text-sm text-[var(--text-muted)]">
            {mode === "login" ? "Pas encore de compte ?" : "Déjà un compte ?"}{" "}
            <Link className="font-semibold text-[var(--primary)] hover:underline" href={mode === "login" ? "/inscription" : "/connexion"}>
              {mode === "login" ? "Créer un compte" : "Se connecter"}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
