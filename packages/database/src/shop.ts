import { prisma } from "./client.js";
import type { Shop } from "../generated/client/index.js";

/**
 * This system manages exactly one Etsy shop, seeded once with this fixed id
 * (see seed.ts). Every caller that needs "the shop" must resolve it through
 * this id — never through `findFirst()`/`findFirstOrThrow()` with no
 * `orderBy`, which has no defined ordering and silently returns an
 * arbitrary row if more than one ever exists (e.g. from a bug that creates
 * a second Shop row instead of updating this one — see the OAuth callback,
 * which upserts by this id rather than by `etsyShopId`, for exactly that
 * reason).
 */
export const CANONICAL_SHOP_ID = "00000000-0000-0000-0000-000000000001";

/** Resolves the single canonical Shop row. Throws if `pnpm db:seed` hasn't been run yet. */
export async function getCanonicalShop(): Promise<Shop> {
  return prisma.shop.findUniqueOrThrow({ where: { id: CANONICAL_SHOP_ID } });
}

/** Same as `getCanonicalShop`, but returns null instead of throwing — for callers (e.g. dashboard routes) that handle a not-yet-seeded database gracefully. */
export async function findCanonicalShop(): Promise<Shop | null> {
  return prisma.shop.findUnique({ where: { id: CANONICAL_SHOP_ID } });
}
