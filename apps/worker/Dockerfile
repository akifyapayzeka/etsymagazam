# Build from the repo root: docker build -f apps/worker/Dockerfile -t etsymagazam-worker .
FROM node:22-alpine
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @etsymagazam/database run generate
RUN pnpm --filter @etsymagazam/worker run typecheck

ENV NODE_ENV=production
# node needs write access to its own font cache (packages/product-generator fetches
# Google Fonts on first render) and to the shared storage volume.
RUN mkdir -p /repo/storage /repo/apps/worker/.font-cache && chown -R node:node /repo/storage /repo/apps/worker/.font-cache
EXPOSE 4100
USER node
CMD ["pnpm", "--filter", "@etsymagazam/worker", "run", "start"]
