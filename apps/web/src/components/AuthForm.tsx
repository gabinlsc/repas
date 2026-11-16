"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button, Card, Field, Input } from "@mise/ui";
import { useTRPC } from "@/lib/trpc";
import { translator } from "@/lib/i18n";

const t = translator();

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
    <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold text-[var(--primary)]">Mise</h1>
        <p className="mt-2 text-[var(--text-muted)]">{t("app.tagline")}</p>
      </div>
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <h2 className="text-xl font-semibold">{mode === "login" ? t("auth.login") : t("auth.register")}</h2>
          {mode === "register" ? (
            <Field label={t("auth.name")} htmlFor="name">
              <Input id="name" autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          ) : null}
          <Field label={t("auth.email")} htmlFor="email">
            <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label={t("auth.password")} htmlFor="password" hint={mode === "register" ? "10 caractères minimum" : undefined}>
            <Input id="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 10 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {m.error ? <p role="alert" className="text-sm text-[var(--danger)]">{m.error.message}</p> : null}
          <Button type="submit" loading={m.isPending}>{mode === "login" ? t("auth.login") : t("auth.register")}</Button>
        </form>
      </Card>
      <p className="text-center text-sm">
        {mode === "login" ? t("auth.noAccount") : t("auth.hasAccount")}{" "}
        <Link className="font-medium text-[var(--primary)] underline" href={mode === "login" ? "/inscription" : "/connexion"}>
          {mode === "login" ? t("auth.register") : t("auth.login")}
        </Link>
      </p>
    </main>
  );
}
