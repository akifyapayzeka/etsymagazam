# Etsy AI Autopilot

A production-ready system that runs the day-to-day operations of an Etsy
digital-download shop with as little human involvement as possible:
research → product creation → QA/IP checks → SEO → pricing → publish →
analytics → optimize, running on a schedule, with a dashboard that shows
you what happened and how much you made.

**You open and verify the Etsy shop yourself** (account, identity, banking,
taxes, required Etsy verifications). This system takes over from there.

## Documentation

- [`docs/ETSY_SETUP.md`](docs/ETSY_SETUP.md) — the handful of steps only a
  human can do (Etsy Developer app, OAuth), written as literal
  click-by-click instructions. Start here.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system is put
  together: the agent pipeline, packages, data model, what's deterministic
  vs AI-driven.
- [`docs/AUTOPILOT.md`](docs/AUTOPILOT.md) — how the autonomous loop
  actually behaves: limits, the kill switch, scheduled jobs, growth/loser
  management, cost control.
- [`docs/SECURITY.md`](docs/SECURITY.md) — secrets, auth, encryption,
  webhook verification, and the Etsy-compliance boundaries this system
  will not cross.
- [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md) — common problems
  and monitoring guidance.

## Repository layout

```
etsymagazam/
├── apps/
│   ├── dashboard/        Next.js operator dashboard
│   ├── api/               Fastify backend (OAuth, webhooks, dashboard API)
│   └── worker/            BullMQ agents + scheduler (the actual autopilot)
├── packages/
│   ├── etsy/               Etsy Open API v3 client + OAuth2
│   ├── ai/                  Provider-agnostic AI text/image generation
│   ├── product-generator/   Deterministic digital product rendering
│   ├── qa/                  QA, IP/policy guard, duplicate detection
│   ├── database/            Prisma schema + client
│   └── core/                 Env, logging, crypto, storage, prompts, queues
├── prompts/                Versioned AI prompt library
├── docs/
├── scripts/                Pipeline test + Etsy taxonomy fetch helper
├── tests/                  Cross-package integration tests
├── .env.example
├── docker-compose.yml
└── README.md
```

## Quick start (local development)

Requirements: Node 22+, pnpm, PostgreSQL, Redis (or just use
`docker-compose up postgres redis`).

```bash
pnpm install
cp .env.example .env                 # fill in at least DATABASE_URL, REDIS_URL, ENCRYPTION_KEY, SESSION_SECRET
pnpm db:migrate
pnpm db:seed
pnpm --filter @etsymagazam/api run hash-password "your-password"   # put the output in ADMIN_PASSWORD_HASH

pnpm dev:api        # terminal 1
pnpm dev:worker     # terminal 2
pnpm dev:dashboard  # terminal 3
```

Then open `http://localhost:3000`, log in, and follow
[`docs/ETSY_SETUP.md`](docs/ETSY_SETUP.md) to connect your shop. The
system starts **paused** and in **DRY_RUN** mode by default — nothing
touches your real Etsy shop until you turn `DRY_RUN` off and resume
Autopilot from Settings.

Want to see the content pipeline work right now, without any of the above?

```bash
pnpm install
pnpm pipeline:dry-run
```

This runs one full sample product through research → design → files → SEO
→ QA → IP check → pricing, entirely locally, and prints where the output
landed.

## Production deployment

```bash
cp .env.example .env   # fill in real values — see docs/SECURITY.md
docker compose up -d --build
```

This builds and runs Postgres, Redis, the API, the worker, and the
dashboard, running migrations automatically first. See
[`docs/AUTOPILOT.md`](docs/AUTOPILOT.md) for what to configure before
turning `AUTO_PUBLISH` on for real.
