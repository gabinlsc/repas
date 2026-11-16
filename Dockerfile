# syntax=docker/dockerfile:1.7
# Image multi-cibles du monorepo Node : web (Next standalone), worker, migrate (migrations + seed).
ARG NODE_VERSION=22.23.4
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /repo

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/domain/package.json packages/domain/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
COPY data/package.json data/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @mise/domain build && pnpm --filter @mise/db build && pnpm --filter @mise/worker build \
 && DATABASE_URL=postgres://build:build@localhost/build DATA_ENCRYPTION_KEYS=k0:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA= pnpm --filter @mise/web build

FROM node:${NODE_VERSION}-bookworm-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
RUN useradd --uid 10001 --create-home mise
COPY --from=build --chown=mise /repo/apps/web/.next/standalone ./
COPY --from=build --chown=mise /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=mise /repo/apps/web/public ./apps/web/public
USER mise
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM base AS prod-deps
COPY --from=build /repo /repo
RUN pnpm --filter @mise/worker deploy --legacy --prod /out/worker

FROM node:${NODE_VERSION}-bookworm-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
RUN useradd --uid 10001 --create-home mise
COPY --from=prod-deps --chown=mise /out/worker ./
USER mise
HEALTHCHECK --interval=15s --timeout=3s --retries=5 CMD node -e "fetch('http://127.0.0.1:8090').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

# Migrations + seed (idempotents) : lancé une fois avant web/worker.
FROM build AS migrate
WORKDIR /repo/packages/db
CMD ["node", "dist/seed/run.js"]
