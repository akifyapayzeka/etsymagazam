import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Without this, Next's file tracer (used to build the "standalone"
  // output copied into the Docker image) only looks inside
  // apps/dashboard/node_modules — but in this pnpm workspace, hoisted
  // packages like `next` itself live in symlinked/hoisted locations
  // resolved from the monorepo root, not this package's own
  // node_modules. The tracer misses them, producing a standalone build
  // whose server.js does `require("next")` and fails with
  // "Cannot find module 'next'" at container startup. Pointing the
  // tracer root at the monorepo root fixes the resolution.
  outputFileTracingRoot: path.join(__dirname, "../../"),
};

export default nextConfig;
