#!/usr/bin/env tsx
/**
 * Prints Etsy's live seller taxonomy tree so you can pick the right
 * taxonomy_id for each category in apps/worker/src/config/etsy-taxonomy.json.
 * The Publisher Agent refuses to publish a category with a null id rather
 * than guessing — this script is how you fill those in for real, once.
 *
 * Requires: ETSY_API_KEYSTRING set and a shop already connected via the
 * dashboard's "Connect Etsy" button (so a token exists to authenticate with).
 *
 * Run: pnpm tsx scripts/fetch-etsy-taxonomy.ts
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { decryptSecret, encryptSecret, loadEnv } from "@etsymagazam/core";
import { getCanonicalShop, prisma } from "@etsymagazam/database";
import { EtsyApiClient, refreshAccessToken } from "@etsymagazam/etsy";

async function main() {
  const env = loadEnv();
  if (!env.ETSY_API_KEYSTRING || !env.ETSY_SHARED_SECRET) {
    console.error("ETSY_API_KEYSTRING and ETSY_SHARED_SECRET must both be set in your .env — see docs/ETSY_SETUP.md.");
    process.exit(1);
  }

  const shop = await getCanonicalShop();
  if (!shop.etsyShopId) {
    console.error("No connected shop found. Connect Etsy from the dashboard first (Settings -> Connect Etsy).");
    process.exit(1);
  }

  const client = new EtsyApiClient({
    apiKeystring: env.ETSY_API_KEYSTRING,
    sharedSecret: env.ETSY_SHARED_SECRET,
    shopId: shop.etsyShopId,
    tokenProvider: {
      async getAccessToken(etsyShopId: string) {
        const connection = await prisma.etsyConnection.findFirstOrThrow({
          where: { shop: { etsyShopId }, isActive: true },
          orderBy: { createdAt: "desc" },
        });
        if (Date.now() < connection.expiresAt.getTime() - 5 * 60 * 1000) {
          return decryptSecret(connection.accessTokenEnc);
        }
        const refreshed = await refreshAccessToken({
          clientId: env.ETSY_API_KEYSTRING,
          refreshToken: decryptSecret(connection.refreshTokenEnc),
        });
        await prisma.etsyConnection.update({
          where: { id: connection.id },
          data: {
            accessTokenEnc: encryptSecret(refreshed.access_token),
            refreshTokenEnc: encryptSecret(refreshed.refresh_token),
            expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
          },
        });
        return refreshed.access_token;
      },
    },
  });

  const { results } = await client.getSellerTaxonomyNodes();

  const byParent = new Map<number | null, typeof results>();
  for (const node of results) {
    const list = byParent.get(node.parent_id) ?? [];
    list.push(node);
    byParent.set(node.parent_id, list);
  }

  const lines: string[] = [];
  function printLevel(parentId: number | null, depth: number) {
    for (const node of byParent.get(parentId) ?? []) {
      lines.push(`${"  ".repeat(depth)}[${node.id}] ${node.name}`);
      printLevel(node.id, depth + 1);
    }
  }
  printLevel(null, 0);

  console.log(lines.join("\n"));
  console.log(`\n${results.length} taxonomy nodes total.`);
  console.log("\nFind the right node id for each category, then edit apps/worker/src/config/etsy-taxonomy.json.");

  const outDir = path.resolve(import.meta.dirname, "output");
  await mkdir(outDir, { recursive: true });
  const outPath = path.join(outDir, "etsy-taxonomy-dump.json");
  await writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull JSON dump also saved to ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
