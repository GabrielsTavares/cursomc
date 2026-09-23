# Creator Hub

Phase 1 **Foundation** of the Creator Hub monorepo (Node.js + TypeScript + Fastify).

> Full product design lives in the Cursor Agent Store (`creator-hub-especificacao-mestre.md`, `creator-hub-system-design.md`, `creator-hub-adrs.md`) — not duplicated here.

This repository also contains the legacy Spring study project (`cursomc`); Creator Hub was added alongside without removing that history.

## Stack choices (Phase 1)

| Choice | Why |
|--------|-----|
| **pnpm + Turborepo** | Lightweight monorepo for `apps/*`, `services/*`, `packages/*` |
| **Fastify** | Accepted ADR-001 — lean Node API |
| **Drizzle ORM** | Prefer lean SQL + explicit migrations (ADR-005); better fit for later `SKIP LOCKED` claims than Prisma |
| **JWT Bearer + httpOnly cookie** | Login returns `accessToken` and sets cookie (ADR-004 recommendation for Web + Mobile) |
| **Argon2** | Password hashing |
| **Postgres 16** | Source of truth via Docker Compose |

## Layout

```text
apps/web                 # Vite + React placeholder (calls GET /health)
services/api             # Fastify hexagonal API
packages/shared-types    # Shared TS types
docker-compose.yml       # postgres + api (+ web profile)
data/media               # local media volume mount point
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build
```

- API: `http://localhost:3000/health`
- Optional web: `docker compose --profile web up --build` → `http://localhost:5173`
- Seed user (from `.env.example`): `admin@creator.local` / `changeme123`

Media files persist in the `media_data` Compose volume (`MEDIA_ROOT=/data/media`).

## Local (host API + Compose Postgres)

```bash
cp .env.example .env
# Point DATABASE_URL at localhost:
# DATABASE_URL=postgres://creator:creator@localhost:5432/creator_hub
docker compose up postgres -d
pnpm install
pnpm --filter @creator-hub/shared-types build
pnpm --filter @creator-hub/api db:migrate
pnpm --filter @creator-hub/api db:seed
pnpm --filter @creator-hub/api dev
pnpm --filter @creator-hub/web dev
```

## API (Phase 1)

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | public |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/logout` | required |
| GET | `/api/v1/auth/me` | required |
| GET/POST | `/api/v1/projects` | required |
| GET/PATCH | `/api/v1/projects/:id` | required |

Auth header: `Authorization: Bearer <token>` **or** httpOnly cookie `creator_hub_session`.

## Tests

```bash
pnpm install
pnpm --filter @creator-hub/shared-types build
pnpm test
```

Smoke tests cover `/health` response shape and login domain use case (no Postgres required). Full stack verification: `docker compose up`.

## Phase 1 DoD vs later

**In this PR:** monorepo, Compose, migrations (`users`, `workspaces`, `content_projects`), seed user, login, project CRUD, health, logging, CORS, minimal web, basic tests.

**Phase 2+:** Episodes/Beats, media upload, scheduler/publishers, affiliate module, mobile app, Remotion/TTS, billing.
