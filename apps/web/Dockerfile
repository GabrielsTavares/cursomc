# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/web/package.json apps/web/
RUN pnpm install --filter @creator-hub/web... --frozen-lockfile=false
COPY packages/shared-types packages/shared-types
COPY apps/web apps/web
RUN pnpm --filter @creator-hub/shared-types build
# Build-time only: baked into the static bundle. Must be a URL the *browser* can reach
# (e.g. http://localhost:3000), not the Compose service hostname `api`.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @creator-hub/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
