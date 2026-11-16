"use client";
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "./cn";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--primary)] text-[var(--primary-text)] hover:bg-[var(--primary-hover)]",
  secondary: "bg-[var(--surface-2)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--surface)]",
  ghost: "text-[var(--text)] hover:bg-[var(--surface-2)]",
  danger: "bg-[var(--danger)] text-white hover:opacity-90",
};
const sizes: Record<Size, string> = { sm: "h-9 px-3 text-sm", md: "h-11 px-4", lg: "h-14 px-6 text-lg" };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

/** Bouton : cible tactile ≥ 44 px (WCAG 2.5.8) sauf taille « sm » réservée aux zones denses. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      className={cn("inline-flex items-center justify-center gap-2 rounded-[var(--radius)] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed", variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden /> : null}
      {children}
    </button>
  );
});

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]", className)} {...rest} />;
}

export function Badge({ tone = "neutral", className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: "neutral" | "success" | "warning" | "danger" | "accent" }) {
  const tones = {
    neutral: "bg-[var(--surface-2)] text-[var(--text-muted)]",
    success: "bg-[color-mix(in_oklab,var(--success)_15%,transparent)] text-[var(--success)]",
    warning: "bg-[color-mix(in_oklab,var(--warning)_15%,transparent)] text-[var(--warning)]",
    danger: "bg-[color-mix(in_oklab,var(--danger)_15%,transparent)] text-[var(--danger)]",
    accent: "bg-[color-mix(in_oklab,var(--accent)_15%,transparent)] text-[var(--accent)]",
  };
  return <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", tones[tone], className)} {...rest} />;
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn("h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)] placeholder:text-[var(--text-muted)]", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...rest }, ref) {
  return <select ref={ref} className={cn("h-11 w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[var(--text)]", className)} {...rest} />;
});

export function Field({ label, hint, error, htmlFor, children }: { label: string; hint?: string; error?: string | null; htmlFor: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint && !error ? <p className="text-xs text-[var(--text-muted)]">{hint}</p> : null}
      {error ? (
        <p className="text-xs text-[var(--danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-[var(--radius)] bg-[var(--surface-2)]", className)} aria-hidden />;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-3 py-10 text-center">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children ? <div className="max-w-md text-[var(--text-muted)]">{children}</div> : null}
      {action}
    </Card>
  );
}

export function ErrorState({ title, detail, onRetry, retryLabel }: { title: string; detail?: string; onRetry?: () => void; retryLabel: string }) {
  return (
    <Card role="alert" className="flex flex-col gap-2 border-[var(--danger)]">
      <p className="font-semibold text-[var(--danger)]">{title}</p>
      {detail ? <p className="text-sm text-[var(--text-muted)]">{detail}</p> : null}
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry} className="self-start">
          {retryLabel}
        </Button>
      ) : null}
    </Card>
  );
}

/** Case à cocher grand format (mode magasin : un tap, gros doigts, gants…). */
export function BigCheckbox({ checked, onChange, label, sublabel, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; sublabel?: string; id: string }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-16 cursor-pointer items-center gap-4 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3", checked && "opacity-60")}>
      <input id={id} type="checkbox" className="h-7 w-7 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="flex flex-col">
        <span className={cn("text-lg", checked && "line-through")}>{label}</span>
        {sublabel ? <span className="text-sm text-[var(--text-muted)]">{sublabel}</span> : null}
      </span>
    </label>
  );
}

/** Curseur 0–10 accessible (poids de l'optimisation). */
export function Slider({ id, label, value, onChange, min = 0, max = 10 }: { id: string; label: string; value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-sm">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className="font-mono">
          {value}
        </output>
      </div>
      <input id={id} type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[var(--primary)]" />
    </div>
  );
}

/** Boîte de dialogue native (`<dialog>`) : piège de focus et Échap gérés par le navigateur. */
export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="dialog-title" className="m-auto w-[min(92vw,32rem)] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-0 text-[var(--text)] backdrop:bg-black/40">
      <div className="flex flex-col gap-4 p-5">
        <h2 id="dialog-title" className="text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
