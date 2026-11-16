"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MEAL_SLOTS, type MealSlot } from "@mise/domain";
import { Badge, Button, Card, Field, Input, Select } from "@mise/ui";
import { translator, type MessageKey } from "@/lib/i18n";
import { useTRPC } from "@/lib/trpc";

const t = translator();

/**
 * Import par URL ou texte collé, puis écran de validation : chaque ligne ambiguë ou
 * inconnue doit être associée explicitement à un ingrédient du catalogue — sinon la
 * recette reste « à valider » et n'est jamais planifiée (sécurité allergènes).
 */
export default function ImportPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const [mode, setMode] = useState<"url" | "text">("url");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const fromUrl = useMutation(trpc.recipes.importUrl.mutationOptions());
  const fromText = useMutation(trpc.recipes.importText.mutationOptions());
  const draft = fromUrl.data ?? fromText.data;
  const [choices, setChoices] = useState<Record<number, string>>({});
  const [title, setTitle] = useState<string | null>(null);
  const [slots, setSlots] = useState<MealSlot[]>(["lunch", "dinner"]);
  const create = useMutation(trpc.recipes.create.mutationOptions({ onSuccess: (r) => router.push(`/recettes/${r.id}`) }));
  const error = fromUrl.error ?? fromText.error ?? create.error;

  const save = () => {
    if (!draft) return;
    create.mutate({
      title: title ?? draft.title,
      prepMinutes: draft.prepMinutes,
      cookMinutes: draft.cookMinutes,
      baseServings: draft.servings,
      difficulty: 1,
      equipment: [],
      mealSlots: slots,
      tags: [],
      cuisine: null,
      leftoverDays: 0,
      freezes: false,
      steps: draft.steps.length ? [...draft.steps] : ["Voir la source."],
      sourceUrl: draft.sourceUrl,
      sourceName: draft.sourceName,
      lines: draft.lines.map((l, i) => ({ rawText: l.rawText, ingredientId: choices[i] ?? l.ingredientId, quantity: l.quantity, unit: l.unit, note: l.note, optional: l.optional })),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">{t("recipes.import")}</h1>
      <div role="tablist" className="flex gap-2">
        <Button role="tab" aria-selected={mode === "url"} variant={mode === "url" ? "primary" : "secondary"} onClick={() => setMode("url")}>Depuis une URL</Button>
        <Button role="tab" aria-selected={mode === "text"} variant={mode === "text" ? "primary" : "secondary"} onClick={() => setMode("text")}>Texte collé</Button>
      </div>
      <Card className="flex flex-col gap-3">
        {mode === "url" ? (
          <Field label="Adresse de la recette" htmlFor="url">
            <Input id="url" type="url" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        ) : (
          <Field label="Texte de la recette" htmlFor="txt" hint="Titre, « Pour 4 personnes », « Ingrédients », « Préparation »…">
            <textarea id="txt" rows={10} className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3" value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
        )}
        <Button className="self-start" loading={fromUrl.isPending || fromText.isPending} onClick={() => (mode === "url" ? fromUrl.mutate({ url }) : fromText.mutate({ text }))}>Analyser</Button>
      </Card>
      {error ? <p role="alert" className="text-[var(--danger)]">{error.message}</p> : null}
      {draft ? (
        <Card className="flex flex-col gap-3">
          <Field label="Titre" htmlFor="title"><Input id="title" value={title ?? draft.title} onChange={(e) => setTitle(e.target.value)} /></Field>
          <fieldset>
            <legend className="text-sm font-medium">Repas</legend>
            <div className="flex gap-3">{MEAL_SLOTS.map((s) => <label key={s} className="flex items-center gap-1"><input type="checkbox" checked={slots.includes(s)} onChange={() => setSlots(slots.includes(s) ? slots.filter((x) => x !== s) : [...slots, s])} />{t(`slot.${s}` as MessageKey)}</label>)}</div>
          </fieldset>
          <h2 className="font-semibold">Correspondance des ingrédients</h2>
          <ul className="flex flex-col gap-2">
            {draft.lines.map((l, i) => (
              <li key={i} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-2">
                <span>{l.rawText} {l.match === "matched" ? <Badge tone="success">reconnu</Badge> : <Badge tone="warning">{l.match === "ambiguous" ? "ambigu" : "inconnu"}</Badge>}</span>
                <Select aria-label={`Ingrédient pour « ${l.rawText} »`} value={choices[i] ?? l.ingredientId ?? ""} onChange={(e) => setChoices({ ...choices, [i]: e.target.value })}>
                  <option value="">— à associer —</option>
                  {l.candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </li>
            ))}
          </ul>
          <Button onClick={save} loading={create.isPending} className="self-start">{t("common.save")}</Button>
        </Card>
      ) : null}
    </div>
  );
}
