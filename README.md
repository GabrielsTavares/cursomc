# Creator Hub

Phase 1 Foundation + **Scheduling / Publishing** (calendário, scheduler idempotente, TikTok + Instagram live adapters, Kwai manual).

> Design completo: Agent Store (`creator-hub-especificacao-mestre.md`, `creator-hub-system-design.md`, `creator-hub-adrs.md`, **`creator-hub-publish-integracoes.md`**).

This repository also contains the legacy Spring study project (`cursomc`); Creator Hub was added alongside without removing that history.

## Stack choices

| Choice | Why |
|--------|-----|
| **pnpm + Turborepo** | Monorepo `apps/*`, `services/*`, `packages/*` |
| **Fastify** | ADR-001 |
| **Drizzle ORM** | Lean SQL + `FOR UPDATE SKIP LOCKED` claims |
| **JWT Bearer + httpOnly cookie** | Web + Mobile ready |
| **Argon2** | Password hashing |
| **Postgres 16** | Compose |
| **AES-256-GCM vault** | Social tokens (`CREDENTIALS_ENCRYPTION_KEY`) |
| **Local MediaStorage** | Multipart → volume (`MEDIA_ROOT`) — **S3/R2 próximo** |
| **In-process scheduler** | Claim due publications every N seconds |

## Quick start

```bash
cp .env.example .env
docker compose --profile web up --build -d
```

- API: `http://localhost:3000/health`
- Web: `http://localhost:5173` · seed `admin@creator.local` / `changeme123`

Default **`PUBLISH_MODE=dry_run`** — agenda e “publica” sem chamar TikTok/Meta.

## Publicação (este PR)

Fluxo UI: **Conteúdo** (upload) → **Calendário** (redes + legendas + horários) → scheduler → status.

| Plataforma | Adapter | Live |
|------------|---------|------|
| TikTok | Content Posting API (`inbox` ou `direct`) | Sim (tokens colados) |
| Instagram | Graph Reels (container + resumable + publish) | Sim |
| Kwai | Manual checklist | Não há API pública BR |
| Outras | ManualPublisher | — |

Docs oficiais citadas em detalhe: ver Agent Store `docs/creator-hub-publish-integracoes.md` e secção abaixo.

### Docs oficiais (obrigatório)

- TikTok Content Posting: https://developers.tiktok.com/doc/content-posting-api-get-started  
- TikTok inbox upload (`video.upload`): https://developers.tiktok.com/doc/content-posting-api-get-started-upload-content  
- TikTok Direct Post (`video.publish`): https://developers.tiktok.com/doc/content-posting-api-reference-direct-post  
- Instagram Content Publishing: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing  
- IG media / Reels: https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/  

### Env (publish)

```env
PUBLISH_MODE=dry_run          # ou live
SCHEDULER_ENABLED=true
SCHEDULER_INTERVAL_SECONDS=15
TIKTOK_CLIENT_KEY=
TIKTOK_CLIENT_SECRET=
TIKTOK_POST_MODE=inbox        # ou direct
META_APP_ID=
META_APP_SECRET=
META_GRAPH_VERSION=v21.0
```

Tokens de utilizador: colar na UI **Contas sociais** (não no frontend em claro após save). OAuth popup = passo 2.

### Como criar apps (resumo)

**TikTok:** [developers.tiktok.com](https://developers.tiktok.com/) → app → Content Posting API → scopes `video.upload` / `video.publish` (review) → Login Kit para token → colar no Hub.

**Meta/IG:** [developers.facebook.com](https://developers.facebook.com/) → app → Instagram Graph / Content Publishing → IG profissional + Page → token + **IG User ID** no campo ID externo do Hub.

**Kwai BR:** sem API pública de posting — upload no telemóvel + “Marquei como publicado”.

## API (trechos publish)

| Method | Path |
|--------|------|
| GET/POST | `/api/v1/projects/:id/publications` |
| POST | `…/publications/:publicationId/cancel` |
| POST | `…/publications/:publicationId/retry` |
| POST | `…/publications/:publicationId/publish-now` |
| POST | `…/publications/:publicationId/mark-published` |

Statuses: `DRAFT` \| `SCHEDULED` \| `PUBLISHING` \| `PUBLISHED` \| `FAILED` \| `CANCELLED` \| `MANUAL_REQUIRED`.

## Tests

```bash
pnpm install
pnpm --filter @creator-hub/shared-types build
pnpm test
pnpm --filter @creator-hub/api build
pnpm --filter @creator-hub/web build
```

Inclui testes de claim idempotente + FakePublisher / Kwai manual / TikTok dry_run.

## Próximo

- OAuth oficial (sem paste de tokens)
- S3/R2 em vez de local FS
- YouTube Shorts adapter
- Refresh token TikTok/Meta automático
