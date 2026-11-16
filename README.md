# Mise — planificateur de repas & liste de courses intelligente

> « Dis-moi ton budget et tes contraintes, je te donne la semaine, la liste, et zéro gaspillage. »

Application web (PWA installable, utilisable hors ligne en magasin) qui génère chaque semaine un plan de repas optimisé sous contraintes (budget, allergies, régimes, temps, matériel, restes, stock), puis une liste de courses fusionnée, convertie en conditionnements réels au coût minimal et triée dans l'ordre des rayons du magasin.

## Déployer sur un serveur (Debian/Ubuntu)

```bash
curl -fsSL https://raw.githubusercontent.com/gabinlsc/repas/main/deploy.sh | sudo DOMAIN=repas.example.fr EMAIL=admin@example.fr bash
```

Le script gère tout : paquets, Docker, secrets, construction, migrations, nginx, HTTPS, pare-feu, sauvegardes, mises à jour (`sudo mise-update`). Détails : [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Lancer localement

```bash
docker compose up            # tout-en-un avec données de démo → http://localhost:3000
```

Développement :
```bash
docker compose -f infra/docker-compose.dev.yml up -d     # PostgreSQL, Redis, solveur
pnpm install && pnpm --filter @mise/domain build && pnpm --filter @mise/db build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/mise pnpm db:seed
cp .env.example apps/web/.env.local   # adapter DATABASE_URL, PLANNER_URL, DATA_ENCRYPTION_KEYS
pnpm --filter @mise/web dev
```

## Architecture

```
apps/web            Next.js 16 (App Router) + tRPC + Tailwind — PWA, API, SSE
apps/worker         worker BullMQ : génération asynchrone des plans
services/planner    FastAPI + OR-Tools CP-SAT (Python 3.12, mypy strict)
packages/domain     logique métier pure : quantités exactes, unités, parseur, liste de courses, conditionnements, sync LWW
packages/db         schéma Drizzle, migrations, seed (176 ingrédients, 226 conditionnements, 157 recettes), services
packages/ui         design system (jetons clair/sombre, composants accessibles)
data/               import Ciqual (ANSES)
bench/              benchmark reproductible du solveur
docs/               DECISIONS, ERD, THREAT_MODEL, API, RUNBOOK, BACKLOG
infra/              Compose de développement, Caddyfile
```

## Qualité

| Contrôle | Résultat (machine de dev, 4 vCPU) |
|---|---|
| `packages/domain` | 113 tests (dont propriétés fast-check), couverture lignes 98 % |
| `services/planner` | 24 tests pytest/Hypothesis, propriété « aucun allergène » sur 10 000 cas, couverture 98 % |
| `packages/db` | 13 tests d'intégration PostgreSQL |
| `apps/web` | 41 tests (intégration tRPC dont cloisonnement inter-foyers, unitaires), couverture 84 % |
| E2E Playwright | inscription → plan → liste → mode magasin hors ligne → resynchronisation, desktop + mobile (≈ 10–17 s) |
| Benchmark | 500 recettes, 7 j × 3 repas, 6 membres : p95 ≈ 5,5 s (limite 10 s), déterministe |

```bash
pnpm lint && pnpm typecheck && pnpm test
cd services/planner && uv run pytest && uv run mypy && uv run python ../../bench/run.py
pnpm --filter @mise/web e2e
```

Décisions d'architecture : [docs/DECISIONS.md](docs/DECISIONS.md) · Reste à faire : [docs/BACKLOG.md](docs/BACKLOG.md).
