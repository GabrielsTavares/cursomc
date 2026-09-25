# Creator Hub

Phase 1 **Foundation** of the Creator Hub monorepo (Node.js + TypeScript + Fastify), with **projects**, **social accounts**, and **content / media upload** (Episode + MediaAsset).

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
| **AES-256-GCM vault** | MVP storage for social tokens/API keys (`CREDENTIALS_ENCRYPTION_KEY`) |
| **Local MediaStorage** | Multipart upload to Compose volume (`MEDIA_ROOT`) — S3/R2 later |

## Layout

```text
apps/web                 # Vite + React — login, projetos, conteúdo, contas sociais
services/api             # Fastify hexagonal API
packages/shared-types    # Shared TS types
docker-compose.yml       # postgres + api (+ web profile)
data/media               # local media volume mount point
```

## Quick start (Docker)

```bash
cp .env.example .env
docker compose up --build -d
```

- API: `http://localhost:3000/health`
- Optional web: `docker compose --profile web up --build -d` → `http://localhost:5173`
- Seed user (from `.env.example`): `admin@creator.local` / `changeme123`

Media files persist in the `media_data` Compose volume (`MEDIA_ROOT=/data/media`).

### Como logar, criar projeto, conteúdo e upload

1. Suba API + Postgres (+ web):

   ```bash
   docker compose --profile web up --build -d
   ```

2. Abra `http://localhost:5173/`
3. Entre com o seed: **email** `admin@creator.local` / **senha** `changeme123`
4. Em **Projetos**, clique **Novo projeto**
5. Abra o projeto → aba **Conteúdo** → **+ Novo conteúdo** (vídeo / foto / carrossel)
6. Seleciona o item → **Upload** (drag-drop ou file picker) → preview 9:16
7. Aba **Biblioteca** lista assets do projeto; **Contas sociais** continua disponível

A web no Compose é buildada com `VITE_API_URL=http://localhost:3000` (URL que o **browser no host** alcança). A API aceita CORS de `http://localhost:5173` com credentials; o login guarda o JWT (`accessToken`) e também recebe o cookie httpOnly `creator_hub_session`.

### Validar no Compose (checklist rápido)

```bash
# health
curl -s http://localhost:3000/health

# login → token
TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"admin@creator.local","password":"changeme123"}' | jq -r .accessToken)

# criar projeto
PROJECT_ID=$(curl -s -X POST http://localhost:3000/api/v1/projects \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Demo","projectType":"CREATOR"}' | jq -r .project.id)

# criar conteúdo (episode)
EPISODE_ID=$(curl -s -X POST "http://localhost:3000/api/v1/projects/$PROJECT_ID/episodes" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"title":"Demo foto","contentKind":"IMAGE"}' | jq -r .episode.id)

# upload imagem
curl -s -X POST "http://localhost:3000/api/v1/projects/$PROJECT_ID/episodes/$EPISODE_ID/media" \
  -H "authorization: Bearer $TOKEN" \
  -F "file=@./path/to/image.png;type=image/png" | jq .

# listar biblioteca
curl -s "http://localhost:3000/api/v1/projects/$PROJECT_ID/media" \
  -H "authorization: Bearer $TOKEN" | jq .
```

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

No Vite, `VITE_API_URL` default é `http://localhost:3000`. Se preferir same-origin, defina `VITE_API_URL=` (vazio) e o proxy em `vite.config.ts` encaminha `/api` e `/health` para a API.

## API (Phase 1 + social + content)

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | public |
| POST | `/api/v1/auth/login` | public |
| POST | `/api/v1/auth/logout` | required |
| GET | `/api/v1/auth/me` | required |
| GET/POST | `/api/v1/projects` | required |
| GET/PATCH/DELETE | `/api/v1/projects/:id` | required |
| GET/POST | `/api/v1/projects/:id/social-accounts` | required |
| PATCH/DELETE | `/api/v1/projects/:id/social-accounts/:accountId` | required |
| GET/POST | `/api/v1/projects/:id/episodes` | required |
| DELETE | `/api/v1/projects/:id/episodes/:episodeId` | required |
| GET/POST | `/api/v1/projects/:id/episodes/:episodeId/media` | required (POST = multipart `file`) |
| GET | `/api/v1/projects/:id/media` | required |
| DELETE | `/api/v1/projects/:id/media/:mediaId` | required |
| GET | `/api/v1/projects/:id/media/:mediaId/file` | required (stream) |

Auth header: `Authorization: Bearer <token>` **or** httpOnly cookie `creator_hub_session`.

**Tipos de conteúdo (MVP):** `VIDEO` (1× mp4/webm), `IMAGE` (1× jpg/png/webp), `CAROUSEL` (N imagens ordenadas).

**Limites:** `MEDIA_MAX_IMAGE_BYTES` / `MEDIA_MAX_VIDEO_BYTES` no `.env`. Storage keys são geradas pelo servidor (`{projectId}/{uuid}.ext`) — path traversal rejeitado.

Listagens de contas sociais **nunca** devolvem secrets em claro — só máscaras (`****` + last4) e `hasExtraJson`.

### Credential vault (MVP — limitações)

- Tabela `social_account_secrets` com payload AES-256-GCM
- Chave: `CREDENTIALS_ENCRYPTION_KEY` no `.env` (mín. 32 chars)
- **Não** é KMS / Vault enterprise: uma chave partilhada; rotação exige re-encriptar linhas; `.env` comprometido expõe tokens
- OAuth real (popup TikTok/Meta/YouTube) **não** está neste PR — use paste de tokens / Manual status

`ManualPublisher` stub existe no código (ADR-006) e marca fluxo `MANUAL_REQUIRED` com checklist; adapters OAuth ficam para depois.

## Tests

```bash
pnpm install
pnpm --filter @creator-hub/shared-types build
pnpm test
pnpm --filter @creator-hub/api build
pnpm --filter @creator-hub/web build
```

Smoke + unit: `/health`, login, **projects CRUD**, **social accounts**, **episodes + upload/list/delete** (MIME, path traversal). Full stack: `docker compose --profile web up --build`.

## Phase 1 DoD vs later

**In this PR:** monorepo, Compose, migrations (`users`, `workspaces`, `content_projects`, `social_accounts`, `social_account_secrets`, **`episodes`**, **`media_assets`**), seed user, login, project CRUD + UI, social account link + encrypted credentials, **content library + multipart upload** (LocalMediaStorage), ManualPublisher stub, basic tests.

**Depois (calendário / publish + Phase 2+):** scheduler + publications, OAuth real TikTok/Meta/YouTube, beats/roteiro completo, Remotion/TTS, affiliate module, mobile app, billing, KMS, S3/R2.
