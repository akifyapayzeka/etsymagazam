# Build from the repo root: docker build -f apps/api/Dockerfile -t etsymagazam-api .
FROM node:22-alpine
# Without a real openssl binary, Prisma can't detect the actual OpenSSL
# version on Alpine, falls back to a wrong guess, and then tries to
# download/write a corrected query engine at RUNTIME — which fails once
# USER node drops privileges below, since node_modules is root-owned from
# the build steps ("Can't write to .../@prisma/engines ... right
# permissions"). Installing openssl lets Prisma detect it correctly at
# generate time (below) so no runtime engine fetch is ever needed.
RUN apk add --no-cache openssl
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
