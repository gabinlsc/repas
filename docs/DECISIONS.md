# Décisions d'architecture — Mise

Format : **Contexte → Options → Choix → Conséquences**. Chaque décision non triviale prise pendant le développement est consignée ici (ADR légers, numérotés).

---

## D-001 — Monorepo pnpm + Turborepo
- **Contexte** : web, worker, domaine partagé, schéma DB, design system et solveur Python doivent évoluer ensemble.
- **Options** : dépôts séparés ; Nx ; pnpm workspaces + Turborepo.
- **Choix** : pnpm workspaces + Turborepo (imposé). Le service Python vit dans `services/planner`, hors workspace pnpm, géré par `uv`.
- **Conséquences** : builds incrémentaux et cache Turbo ; le contrat TS↔Python est maintenu par un schéma versionné (`/v1/plan`) testé des deux côtés.

## D-002 — API : tRPC dans Next.js (et non REST/OpenAPI ni Fastify séparé)
- **Contexte** : un seul client (la PWA), besoin de typage bout en bout.
- **Options** : (a) REST + OpenAPI + génération de client ; (b) tRPC dans les Route Handlers Next ; (c) Fastify séparé.
- **Choix** : (b) tRPC v11 monté sur `/api/trpc`, validations Zod. Le seul contrat inter-langages (Node↔Python) est en REST/OpenAPI (FastAPI le génère : `/openapi.json`).
- **Conséquences** : zéro codegen, refactors sûrs. Si un client tiers apparaît, on exposera un adaptateur OpenAPI (trpc-to-openapi) — ticket BACKLOG B-010.

## D-003 — Quantités exactes : rationnels `bigint`
- **Contexte** : interdiction des flottants binaires pour les quantités métier ; conversions volume↔masse via densités décimales ; mise à l'échelle par `portion_factor`.
- **Options** : `decimal.js` ; virgule fixe entière ; rationnels exacts.
- **Choix** : type `Rational` (numérateur/dénominateur `bigint`, normalisé) dans `packages/domain`. Arrondi uniquement aux frontières (stockage `numeric(14,3)`, affichage, achat), toujours avec une direction explicite (`ceil` pour les achats : jamais d'achat inférieur au besoin).
- **Conséquences** : associativité/commutativité exactes (vérifiées par tests de propriétés) ; en base, `numeric` transite en `string` (jamais en `number`).

## D-004 — Argent : centimes entiers
- **Choix** : prix et budgets en centimes (`integer` en base, `number` entier sûr en TS, `int` en Python). Les calculs de prix unitaires passent par `Rational` puis arrondi `ceil` au centime.

## D-005 — Unités de base par ingrédient
- **Choix** : chaque ingrédient a une unité de base (`g`, `ml` ou `piece`). Conversions : table `unit` (facteur vers g/ml/pièce) + `unit_conversion` spécifique à un ingrédient (ex. « gousse » d'ail = 5 g, « tasse » de farine via densité 0,55 g/ml). Pièces ↔ masse via `piece_weight_g`. Unités floues (`pincée`, `à votre goût`, `filet`) → exclues du calcul, listées en « basiques à vérifier ».

## D-006 — Solveur : CP-SAT, déterminisme par temps déterministe
- **Contexte** : même snapshot + même graine ⇒ même plan ; temps borné.
- **Options** : limite de temps mur seule (non déterministe) ; `num_workers=1` (lent) ; temps déterministe CP-SAT.
- **Choix** : `random_seed = seed`, `num_workers` fixe, `interleave_search=True` (recherche multi-thread déterministe) et budget en `max_deterministic_time` dérivé de `time_limit`. La limite mur (`max_time_in_seconds = time_limit`) reste un garde-fou ; si elle est atteinte avant le temps déterministe, la réponse l'indique (`deterministic: false`).
- **Conséquences** : reproductibilité testée (`test_determinism`). Sur machine très lente, on peut perdre la reproductibilité — signalé dans la réponse.

## D-007 — Modèle de coût du solveur : paquets entiers du produit de référence
- **Contexte** : la contrainte budget porte sur les achats nets après stock ; le choix exact de conditionnements est un problème de couverture fait par la liste de courses.
- **Choix** : dans CP-SAT, pour chaque ingrédient, une variable entière `packs_i` du conditionnement au meilleur prix unitaire, `packs_i × taille ≥ besoin − stock`. La liste de courses refait ensuite une optimisation exacte multi-produits (programmation dynamique) qui est toujours ≤ au coût estimé par le solveur.
- **Conséquences** : la contrainte budget est conservatrice (jamais de dépassement dû au solveur).

## D-008 — Diagnostic d'infaisabilité par relaxation guidée
- **Choix** : (1) pré-analyse statique (créneau sans aucune recette compatible ⇒ message nommant les convives/allergènes) ; (2) si CP-SAT renvoie INFEASIBLE, on re-résout avec des variables d'écart pondérées sur chaque famille de contraintes relâchables (budget, temps, répétition, DLC) et on rapporte celles qui sont actives avec leur ampleur (« budget minimum estimé : 54,20 € »). Les allergènes/régimes ne sont **jamais** relâchés.

## D-009 — Allergènes : exclusion structurelle
- **Choix** : les variables `x[r,d,s]` ne sont **pas créées** si la recette contient un allergène d'un convive présent ou viole son régime. Les allergènes d'une recette sont **recalculés par règles** à partir des ingrédients (jamais saisis par un LLM ni par l'utilisateur). Test property-based (10 000 cas, Hypothesis) + test côté TS sur la construction du snapshot.

## D-010 — Jobs : BullMQ + worker Node
- **Choix** : la génération est asynchrone (`generation_job` en base + file BullMQ sur Redis). Le worker Node (`apps/worker`) appelle le solveur HTTP, écrit le plan et les explications. Celery n'est pas utilisé : le solveur reste un service HTTP sans état, plus simple à tester et à mettre à l'échelle.

## D-011 — Hors-ligne et partage : Dexie + file d'opérations idempotentes + LWW par champ, temps réel SSE
- **Options** : Yjs (CRDT) ; LWW par champ avec horloge logique hybride (HLC).
- **Choix** : LWW par champ avec HLC (`field_clock` JSON par item). Chaque opération porte un UUID (clé d'idempotence, table `sync_op`). Le temps réel entre membres utilise **SSE** + Redis pub/sub (pas de WebSocket à gérer derrière le proxy).
- **Conséquences** : les cases cochées convergent sans perte ; la fusion est déterministe et testée. Yjs serait utile pour du texte collaboratif — hors périmètre.

## D-012 — Auth : sessions opaques httpOnly + Argon2id
- **Choix** : jeton aléatoire 256 bits en cookie `httpOnly; Secure; SameSite=Lax`, stocké **haché** (SHA-256) en base. Rotation : un jeton de plus de 24 h est remplacé au prochain appel (le précédent reste valide 60 s pour les requêtes concurrentes). Expiration glissante 30 jours. Argon2id (`@node-rs/argon2`, m=19 MiB, t=2, p=1 — recommandations OWASP). CSRF : `SameSite=Lax` + vérification de l'en-tête `Origin` sur toute mutation. OAuth Google/Apple : interface prête (`oauth_account`), fournisseurs en BACKLOG B-001.

## D-013 — Chiffrement applicatif des données de santé
- **Choix** : allergies, régimes, aversions et cibles nutritionnelles d'un membre sont stockés dans `household_member.sensitive` chiffré AES-256-GCM (clé `DATA_ENCRYPTION_KEY`, identifiant de clé préfixé pour la rotation). Déchiffrés uniquement côté serveur.

## D-014 — Reverse proxy : nginx (déploiement VPS) et Caddy (compose autonome)
- **Contexte** : le prompt impose Caddy dans Docker Compose ; le script `deploy.sh` demandé doit gérer nginx sur l'hôte.
- **Choix** : `deploy.sh` installe nginx + certbot sur l'hôte (en-têtes de sécurité, HSTS, SSE sans buffering). `infra/docker-compose.prod.yml` conserve un profil `caddy` pour qui préfère un déploiement 100 % conteneurs.

## D-015 — UI : Tailwind v4 + composants maison style shadcn
- **Choix** : `packages/ui` fournit tokens CSS (clair/sombre), `Button`, `Card`, `Input`, `Badge`, `Toast` (undo), `Skeleton`, `EmptyState`… écrits à la manière de shadcn/ui (copiés, possédés) sans dépendance Radix là où le HTML natif suffit (`<dialog>`, `<details>`). Glisser-déposer via `@dnd-kit` (capteur clavier = accessible).

## D-016 — i18n maison typée
- **Choix** : dictionnaires `fr` (défaut) / `en` typés (`keyof typeof fr`), formats via `Intl.NumberFormat`/`DateTimeFormat`. Moins de dépendances que next-intl, suffisant pour 2 langues.

## D-017 — Données de départ
- **Nutrition** : valeurs initiales **approximatives** dérivées des ordres de grandeur Ciqual (`nutrition_source = 'seed-approx'`). Le script `data/ciqual/import.ts` remplace ces valeurs par la table officielle (version et date consignées). `ciqual.anses.fr` n'était pas joignable depuis l'environnement de développement : l'import est testé sur un extrait fixture.
- **Recettes** : 150+ recettes françaises courantes **rédigées pour ce projet** (licence du dépôt), au format texte compact parsé par le même parseur que l'import « texte collé » (le seed teste donc le parseur).
- **Prix** : prix indicatifs 2026 (`source = 'seed'`), à remplacer par les observations réelles (saisie, tickets, Open Prices).

## D-018 — Saisonnalité
- **Choix** : `ingredient.season_months` (1–12) pour les fruits et légumes, d'après les calendriers usuels de France métropolitaine. Score de saison d'une recette = part (pondérée par masse) de ses fruits/légumes de saison sur le mois de la semaine planifiée.

## D-019 — Restes / batch cooking
- **Choix** : une recette `leftover_days > 0` peut être cuisinée en « double » (`cook_big[r,d,s]`) ; un créneau ultérieur dans la fenêtre peut alors être servi en `leftover` (coût 0, préparation 0). Les recettes `freezes` étendent la fenêtre à toute la semaine.

## D-020 — Observabilité
- Logs JSON (pino côté Node, `structlog`-like JSON côté Python) sans données personnelles (identifiants opaques seulement). `/api/metrics` et `/metrics` (Prometheus). OpenTelemetry : SDK Node activé si `OTEL_EXPORTER_OTLP_ENDPOINT` est défini ; FastAPI instrumenté de même.

## D-021 — Traçabilité Git
- Les commits sont attribués au propriétaire du dépôt, sans métadonnées d'outil, et poussés directement sur `main` à sa demande.

---

# Tâches de la phase 1 — Fondations

1. Monorepo pnpm/Turbo, TS strict, ESLint (no-any), Vitest.
2. `docs/` : DECISIONS, ERD, BACKLOG, THREAT_MODEL, API, RUNBOOK.
3. `packages/db` : schéma Drizzle complet (FK, CHECK, UNIQUE, index), migration SQL versionnée, client.
4. Auth : inscription/connexion/déconnexion, sessions, Argon2id, rotation.
5. Squelettes : `apps/web` (Next.js, tRPC, `/api/health`), `apps/worker` (BullMQ, health), `services/planner` (FastAPI `/health`, `/v1/plan`).
6. Docker Compose dev + prod, Caddyfile, `.env.example`, CI GitHub Actions (lint, typecheck, tests, build, audit).
