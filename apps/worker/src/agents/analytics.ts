import { createLogger } from "@etsymagazam/core";
import { prisma } from "@etsymagazam/database";
import { getEtsyClientForShop } from "../lib/etsy-client.js";
import { computeAndStoreDailyFinance } from "./finance.js";

const log = createLogger("analytics-agent");

function startOfDayUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Pulls what Etsy's API actually exposes (shop receipts = orders/revenue)
 * and syncs it into etsy_orders / etsy_order_items / product_metrics.
 * Etsy's v3 API does NOT expose per-listing views/favorites publicly — we
 * do not fabricate those numbers; they stay null until a real source
 * exists (see docs/ARCHITECTURE.md "Available vs unavailable metrics").
 */
export async function refreshAnalytics(shopId: string): Promise<{ ordersSynced: number }> {
  const client = await getEtsyClientForShop(shopId);
  if (!client) {
    log.info({ shopId }, "Skipping analytics refresh — Etsy not connected yet.");
    return { ordersSynced: 0 };
  }

  const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const { results: receipts } = await client.listShopReceipts({ minCreated: since, limit: 100, wasPaid: true });

  let ordersSynced = 0;
  for (const receipt of receipts) {
    const order = await prisma.etsyOrder.upsert({
      where: { etsyReceiptId: String(receipt.receipt_id) },
      update: {
        status: receipt.status,
        grandTotal: receipt.grandtotal.amount / receipt.grandtotal.divisor,
        isRefunded: false,
      },
      create: {
        shopId,
        etsyReceiptId: String(receipt.receipt_id),
        buyerUserId: String(receipt.buyer_user_id),
        status: receipt.status,
        grandTotal: receipt.grandtotal.amount / receipt.grandtotal.divisor,
        currencyCode: receipt.grandtotal.currency_code,
        paidAt: receipt.is_paid ? new Date(receipt.created_timestamp * 1000) : null,
      },
    });

    for (const txn of receipt.transactions ?? []) {
      const listing = await prisma.listing.findUnique({ where: { etsyListingId: String(txn.listing_id) } });
      await prisma.etsyOrderItem.upsert({
        where: { etsyTransactionId: String(txn.transaction_id) },
        update: {},
        create: {
          orderId: order.id,
          listingId: listing?.id,
          etsyTransactionId: String(txn.transaction_id),
          quantity: txn.quantity,
          price: txn.price.amount / txn.price.divisor,
        },
      });

      if (listing) {
        const date = startOfDayUtc(new Date(receipt.created_timestamp * 1000));
        const revenue = (txn.price.amount / txn.price.divisor) * txn.quantity;
        await prisma.productMetric.upsert({
          where: { productId_date: { productId: listing.productId, date } },
          update: { sales: { increment: txn.quantity }, revenue: { increment: revenue } },
          create: { productId: listing.productId, listingId: listing.id, date, sales: txn.quantity, revenue },
        });
      }
    }
    ordersSynced += 1;
  }

  await computeAndStoreDailyFinance(shopId);

  log.info({ shopId, ordersSynced }, "Analytics refresh complete");
  return { ordersSynced };
}
