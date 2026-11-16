# @mise/ui — design system

Composants possédés (à la manière de shadcn/ui), stylés par jetons CSS (`tokens.css`) : thèmes clair/sombre automatiques (`prefers-color-scheme`) ou forcés (`data-theme`), `prefers-reduced-motion` respecté, focus visible.

| Composant | Usage | Accessibilité |
|---|---|---|
| `Button` | actions ; variantes primary/secondary/ghost/danger ; `loading` | cible ≥ 44 px, `aria-busy` |
| `Card`, `Badge` | conteneurs, étiquettes | contrastes AA |
| `Input`, `Select`, `Field` | formulaires | label associé, erreurs en `role=alert` |
| `Skeleton`, `EmptyState`, `ErrorState` | états de chargement, vide, erreur récupérable | `aria-hidden` sur les squelettes |
| `BigCheckbox` | mode magasin | zone tactile 64 px |
| `Slider` | poids de l'optimisation | `<output>` lié |
| `Dialog` | modales | `<dialog>` natif (focus, Échap) |
| `ToastProvider` / `useToast` | notifications avec « Annuler » | région `aria-live` |
