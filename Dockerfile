# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install --frozen-lockfile || pnpm install

FROM deps AS build
RUN pnpm --filter @ai-kanban/web build
RUN pnpm --filter @ai-kanban/server build

FROM base AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
ENV PORT=3000
ENV AIKANBAN_DATA_DIR=/app/data
ENV DATABASE_URL=file:/app/data/pglite
ENV BETTER_AUTH_URL=http://localhost:3000

COPY --from=build /app /app

EXPOSE 3000
VOLUME ["/app/data"]

CMD ["pnpm", "--filter", "@ai-kanban/server", "start"]
