# Build from the repo root: docker build -f apps/api/Dockerfile -t etsymagazam-api .
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo

# Copy the whole monorepo — TS runs directly via tsx (no per-package build step),
# so the API container needs the source of every workspace package it imports.
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @etsymagazam/database run generate
RUN pnpm --filter @etsymagazam/api run typecheck

ENV NODE_ENV=production
RUN mkdir -p /repo/storage && chown -R node:node /repo/storage
EXPOSE 4000
USER node
CMD ["pnpm", "--filter", "@etsymagazam/api", "run", "start"]
