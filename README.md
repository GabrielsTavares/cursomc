# Creator Hub

Phase 1 **Foundation** of the Creator Hub monorepo (Node.js + TypeScript + Fastify), expanded with **projects + social accounts** in the web UI.

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

## Layout

```text
apps/web                 # Vite + React — login, projetos, contas sociais
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

### Como logar, criar projeto e vincular rede

1. Suba API + Postgres (+ web):

   ```bash
   docker compose --profile web up --build -d
   ```

2. Abra `http://localhost:5173/`
3. Entre com o seed: **email** `admin@creator.local` / **senha** `changeme123`
4. Em **Projetos**, clique **Novo projeto** (nome + tipo: Creator / Affiliate / Brand / Other)
5. Abra o projeto → **Contas sociais** → **+ Vincular rede**
6. Escolha plataforma (TikTok, Instagram, YouTube, Kwai, Facebook, Outra), nome de exibição e cole tokens/API keys
7. Guarde — a API encripta as credenciais; a UI só mostra máscaras (`****` + últimos 4)

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
curl -s -X POST http://localhost:3000/api/v1/projects \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Demo","projectType":"CREATOR"}' | jq .

# vincular conta (secrets mascarados na resposta)
PROJECT_ID=... # id do passo anterior
curl -s -X POST "http://localhost:3000/api/v1/projects/$PROJECT_ID/social-accounts" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"platform":"TIKTOK","displayName":"tiktok_main","credentials":{"accessToken":"tok_ABCDEF1234"}}' | jq .
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

## API (Phase 1 + social accounts)

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

Auth header: `Authorization: Bearer <token>` **or** httpOnly cookie `creator_hub_session`.

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

Smoke + unit: `/health`, login, **projects CRUD**, **social accounts** (máscaras, vault round-trip, ManualPublisher). Full stack: `docker compose --profile web up --build`.

## Phase 1 DoD vs later

**In this PR:** monorepo, Compose, migrations (`users`, `workspaces`, `content_projects`, `social_accounts`, `social_account_secrets`), seed user, login, project CRUD + UI, social account link + encrypted credentials, ManualPublisher stub, basic tests.

**Depois (OAuth real + Phase 2+):** popup OAuth TikTok/Meta/YouTube, refresh automático de tokens, Episodes/Beats, media upload, scheduler/publishers reais, affiliate module, mobile app, Remotion/TTS, billing, KMS.
