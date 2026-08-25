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
COPY --from=build /repo/apps/dashboard/.next/standalone/apps/dashboard ./
COPY --from=build /repo/apps/dashboard/.next/standalone/node_modules ./node_modules
COPY --from=build /repo/apps/dashboard/.next/static ./.next/static
COPY --from=build /repo/apps/dashboard/public ./public

EXPOSE 3000
USER node
CMD ["node", "server.js"]
