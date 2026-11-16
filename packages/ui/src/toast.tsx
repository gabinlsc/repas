"use client";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

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
 * préalable pour les actions destructives (moins de friction, aussi sûr).
 * Annoncées aux lecteurs d'écran via une région `aria-live`.
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
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === "error" ? "alert" : "status"} className="pointer-events-auto flex w-full max-w-md items-center justify-between gap-3 rounded-[var(--radius)] bg-[var(--text)] px-4 py-3 text-[var(--bg)] shadow-lg">
            <span>{t.message}</span>
            {t.actionLabel ? (
              <button
                className="font-semibold underline"
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
