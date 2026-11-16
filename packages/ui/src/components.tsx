"use client";
import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { Loader2, X } from "lucide-react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "soft" | "ghost" | "danger" | "outline";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)] shadow-[var(--shadow-sm)]",
  secondary: "bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] shadow-[var(--shadow-sm)]",
  soft: "bg-[var(--primary-soft)] text-[var(--primary)] hover:brightness-95",
  outline: "border border-[var(--border-strong)] text-[var(--text)] hover:bg-[var(--surface-2)]",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3 text-sm gap-1.5", md: "h-11 px-4 gap-2", lg: "h-13 px-6 text-base gap-2 min-h-[52px]" };

/** Classes d'un bouton, pour styliser un lien comme un bouton (sans imbriquer <button> dans <a>). */
export function buttonClass(variant: Variant = "primary", size: Size = "md", className?: string): string {
  return cn("inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all active:scale-[0.98]", variants[variant], sizes[size], className);
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

/** Bouton : cible tactile ≥ 44 px (WCAG 2.5.8) sauf « sm » réservé aux zones denses. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex select-none items-center justify-center whitespace-nowrap rounded-full font-semibold transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { label: string; variant?: "ghost" | "soft" | "secondary"; size?: "sm" | "md" }>(function IconButton(
  { label, variant = "ghost", size = "md", className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50",
        size === "md" ? "h-11 w-11" : "h-9 w-9",
        variant === "ghost" && "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]",
        variant === "soft" && "bg-[var(--surface-2)] text-[var(--text)] hover:bg-[var(--surface-3)]",
        variant === "secondary" && "border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)]",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
});

export function Card({ className, ...rest }: ComponentProps<"div">) {
  return <div className={cn("rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]", className)} {...rest} />;
}

type Tone = "neutral" | "success" | "warning" | "danger" | "accent" | "saffron" | "primary";
const tones: Record<Tone, string> = {
  neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary)]",
  success: "bg-[var(--primary-soft)] text-[var(--success)]",
  warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
  danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
  accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  saffron: "bg-[var(--saffron-soft)] text-[var(--saffron)]",
};

export function Badge({ tone = "neutral", className, icon, children, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone; icon?: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tones[tone], className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}

/** Puce sélectionnable (filtres, choix multiples) : rôle bouton à bascule. */
export function Chip({ selected, onToggle, children, icon, className, ...rest }: { selected: boolean; onToggle: () => void; children: ReactNode; icon?: ReactNode; className?: string } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick">) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors",
        selected ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]" : "border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--border-strong)]",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode }>(function Input({ className, icon, ...rest }, ref) {
  if (!icon) return <input ref={ref} className={cn("h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-4 text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)]", className)} {...rest} />;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]">{icon}</span>
      <input ref={ref} className={cn("h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] pl-11 pr-4 text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--primary)]", className)} {...rest} />
    </div>
  );
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn("h-12 w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] hover:border-[var(--border-strong)]", className)} {...rest} />;
});

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string | null; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
      {error ? <p className="text-xs font-medium text-[var(--danger)]" role="alert">{error}</p> : null}
    </div>
  );
}

export function Switch({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  const auto = useId();
  const sid = id ?? auto;
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={sid} className="font-semibold">{label}</label>
        {description ? <p className="text-sm text-[var(--text-muted)]">{description}</p> : null}
      </div>
      <button
        id={sid}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn("relative mt-1 h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-[var(--primary)]" : "bg-[var(--surface-3)]")}
      >
        <span className={cn("absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all", checked ? "left-6" : "left-1")} />
      </button>
    </div>
  );
}

/** Choix exclusif en ligne (radiogroup). */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-[var(--border)] bg-[var(--surface-2)] p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("min-h-9 rounded-full px-4 text-sm font-semibold transition-colors", value === o.value ? "bg-[var(--surface)] text-[var(--text)] shadow-[var(--shadow-sm)]" : "text-[var(--text-muted)] hover:text-[var(--text)]")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Progress({ value, max = 100, tone = "primary", label, className }: { value: number; max?: number; tone?: "primary" | "accent" | "warning" | "danger"; label: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  const color = { primary: "var(--primary)", accent: "var(--accent)", warning: "var(--saffron)", danger: "var(--danger)" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={max} className={cn("h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-3)]", className)}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="inline-flex items-center rounded-full border border-[var(--border)] bg-[var(--surface)]" role="group" aria-label={label}>
      <button type="button" className="h-10 w-10 rounded-full text-lg font-bold hover:bg-[var(--surface-2)] disabled:opacity-40" aria-label="Diminuer" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className="min-w-10 text-center font-semibold" aria-live="polite">{value}</output>
      <button type="button" className="h-10 w-10 rounded-full text-lg font-bold hover:bg-[var(--surface-2)] disabled:opacity-40" aria-label="Augmenter" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("mise-shimmer rounded-[var(--radius)]", className)} aria-hidden />;
}

export function EmptyState({ title, children, action, art }: { title: string; children?: ReactNode; action?: ReactNode; art?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--bg-elevated)] px-6 py-14 text-center">
      {art ? <div className="text-5xl" aria-hidden>{art}</div> : null}
      <h2 className="font-display text-2xl font-semibold">{title}</h2>
      {children ? <div className="max-w-md text-[var(--text-muted)]">{children}</div> : null}
      {action}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry, retryLabel }: { title: string; detail?: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--danger)] bg-[var(--danger-soft)] p-5">
      <p className="font-semibold text-[var(--danger)]">{title}</p>
      {detail ? <p className="text-sm text-[var(--text)]">{detail}</p> : null}
      {onRetry ? <Button variant="secondary" size="sm" onClick={onRetry} className="self-start">{retryLabel}</Button> : null}
    </div>
  );
}

/** Case à cocher grand format (mode magasin : un tap, gros doigts, gants…). */
export function BigCheckbox({ checked, onChange, label, sublabel, id, trailing }: { checked: boolean; onChange: (v: boolean) => void; label: string; sublabel?: string; id: string; trailing?: ReactNode }) {
  return (
    <div className={cn("flex min-h-[68px] items-center gap-4 rounded-[var(--radius)] border bg-[var(--surface)] px-4 py-3 transition-all has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-[var(--focus)]", checked ? "border-transparent bg-[var(--surface-2)]" : "border-[var(--border)] shadow-[var(--shadow-sm)]")}>
      <input id={id} type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <label htmlFor={id} className="flex flex-1 cursor-pointer items-center gap-4">
        <span aria-hidden className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-white transition-colors", checked ? "border-[var(--primary)] bg-[var(--primary)]" : "border-[var(--border-strong)]")}>
          {checked ? "✓" : ""}
        </span>
        <span className="flex flex-col">
          <span className={cn("text-lg font-medium", checked && "text-[var(--text-muted)] line-through")}>{label}</span>
          {sublabel ? <span className="text-sm text-[var(--text-muted)]">{sublabel}</span> : null}
        </span>
      </label>
      {trailing}
    </div>
  );
}

/** Curseur 0–10 accessible (poids de l'optimisation). */
export function Slider({ id, label, value, onChange, min = 0, max = 10, description, icon }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max?: number; description?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="flex items-center gap-2 font-semibold">{icon}{label}</label>
        <output htmlFor={id} className="rounded-full bg-[var(--surface-2)] px-2.5 py-0.5 text-sm font-semibold tabular-nums">{value}</output>
      </div>
      {description ? <p className="-mt-1 text-sm text-[var(--text-muted)]">{description}</p> : null}
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[var(--primary)]" />
    </div>
  );
}

/** Boîte de dialogue native (`<dialog>`) : piège de focus et Échap gérés par le navigateur ; feuille en bas sur mobile. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby={titleId}
      className={cn(
        "m-0 mt-auto max-h-[90dvh] w-full max-w-none rounded-t-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-0 text-[var(--text)] shadow-[var(--shadow-lg)] backdrop:bg-black/45 backdrop:backdrop-blur-sm sm:m-auto sm:rounded-[var(--radius-lg)]",
        wide ? "sm:w-[min(94vw,46rem)]" : "sm:w-[min(94vw,32rem)]",
      )}
    >
      {open ? (
        <div className="mise-pop flex max-h-[90dvh] flex-col">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-5 py-4">
            <h2 id={titleId} className="font-display text-xl font-semibold">{title}</h2>
            <IconButton label="Fermer" onClick={onClose}><X className="h-5 w-5" /></IconButton>
          </div>
          <div className="flex flex-col gap-4 overflow-y-auto p-5">{children}</div>
        </div>
      ) : null}
    </dialog>
  );
}

/** Menu contextuel accessible : bouton déclencheur + liste de `menuitem`, Échap et clic extérieur ferment. */
export function Menu({ label, trigger, items, align = "end" }: { label: string; trigger: ReactNode; items: Array<{ label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean }>; align?: "start" | "end" }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    root.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
      >
        {trigger}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            const els = [...(root.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
            const i = els.indexOf(document.activeElement as HTMLButtonElement);
            if (e.key === "ArrowDown") { e.preventDefault(); els[(i + 1) % els.length]?.focus(); }
            if (e.key === "ArrowUp") { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus(); }
          }}
          className={cn("mise-pop absolute z-40 mt-1 min-w-56 overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[var(--shadow-lg)]", align === "end" ? "right-0" : "left-0")}
        >
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              type="button"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm font-medium hover:bg-[var(--surface-2)] focus:bg-[var(--surface-2)] disabled:opacity-40", it.danger && "text-[var(--danger)]")}
            >
              <span aria-hidden className="text-[var(--text-subtle)]">{it.icon}</span>
              {it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function Avatar({ name, className }: { name: string; className?: string }) {
  const hues = [150, 25, 40, 200, 280, 340, 95];
  const h = hues[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % hues.length];
  return (
    <span aria-hidden className={cn("inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold", className)} style={{ background: `hsl(${h} 55% 88%)`, color: `hsl(${h} 60% 25%)` }}>
      {name.trim().slice(0, 2).toUpperCase() || "?"}
    </span>
  );
}

export function Stat({ label, value, hint, icon, children }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-muted)]">{icon}{label}</div>
      <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
      {children}
      {hint ? <div className="text-xs text-[var(--text-muted)]">{hint}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action, id }: { children: ReactNode; action?: ReactNode; id?: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 id={id} className="font-display text-xl font-semibold">{children}</h2>
      {action}
    </div>
  );
}

/**
 * Illustration de recette : dégradé (teinte stable dérivée de la catégorie) et emoji
 * du plat. Pas de photos (droits) : un repère visuel cohérent et léger.
 */
export function RecipeArt({ emoji, hue, size = "md", className }: { emoji: string; hue: number; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const dims = { sm: "h-12 w-12 text-2xl rounded-[12px]", md: "h-16 w-16 text-3xl rounded-[14px]", lg: "aspect-[4/3] w-full text-6xl rounded-[var(--radius)]", xl: "aspect-[16/9] w-full text-7xl rounded-[var(--radius-lg)]" }[size];
  return (
    <div
      aria-hidden
      className={cn("relative flex shrink-0 items-center justify-center overflow-hidden", dims, className)}
      style={{ background: `radial-gradient(120% 90% at 20% 15%, hsl(${hue} 85% 92%), hsl(${(hue + 25) % 360} 60% 80%))` }}
    >
      <span className="absolute -bottom-3 -right-2 text-[2.2em] opacity-15 blur-[1px]">{emoji}</span>
      <span className="relative drop-shadow-sm">{emoji}</span>
    </div>
  );
}
