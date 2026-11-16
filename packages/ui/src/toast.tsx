"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";

interface Toast {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  tone: "info" | "error";
}

interface ToastApi {
  show: (message: string, opts?: { actionLabel?: string; onAction?: () => void; tone?: "info" | "error"; durationMs?: number }) => void;
}

const Ctx = createContext<ToastApi | null>(null);

/**
 * Notifications avec action « Annuler » : on préfère l'annulation à la confirmation
 * préalable pour les actions destructives. Annoncées via une région `aria-live`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const show = useCallback<ToastApi["show"]>(
    (message, opts = {}) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-2), { id, message, actionLabel: opts.actionLabel, onAction: opts.onAction, tone: opts.tone ?? "info" }]);
      setTimeout(() => dismiss(id), opts.durationMs ?? 6000);
    },
    [dismiss],
  );
  const api = useMemo(() => ({ show }), [show]);
  return (
    <Ctx.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 md:bottom-8">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="mise-pop pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-full bg-[#1f1c17] px-5 py-3 text-[#f8f4ec] shadow-[var(--shadow-lg)]">
            {t.tone === "error" ? <AlertTriangle className="h-5 w-5 shrink-0 text-[#ff8b7d]" aria-hidden /> : <CheckCircle2 className="h-5 w-5 shrink-0 text-[#6fcf9c]" aria-hidden />}
            <span className="flex-1 text-sm">{t.message}</span>
            {t.actionLabel ? (
              <button
                className="rounded-full px-2 py-1 text-sm font-bold text-[#6fcf9c] hover:bg-white/10"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast hors de ToastProvider");
  return ctx;
}
