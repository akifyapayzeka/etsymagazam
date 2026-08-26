# Build from the repo root: docker build -f apps/dashboard/Dockerfile -t etsymagazam-dashboard .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo

COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
RUN pnpm --filter @etsymagazam/dashboard run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# next.config.mjs sets outputFileTracingRoot to the monorepo root, so the
# standalone output mirrors full paths relative to that root (server.js at
# apps/dashboard/server.js, and traced node_modules split between
# apps/dashboard/node_modules and the top-level node_modules depending on
# where pnpm's symlinks resolved from) instead of being flattened into
# .next/standalone/. Copying the whole tree — rather than cherry-picking
# apps/dashboard/ and node_modules/ as separate flat copies — keeps that
# structure intact so `next` resolves wherever the tracer actually put it.
COPY --from=build /repo/apps/dashboard/.next/standalone ./
COPY --from=build /repo/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=build /repo/apps/dashboard/public ./apps/dashboard/public

EXPOSE 3000
USER node
CMD ["node", "apps/dashboard/server.js"]
