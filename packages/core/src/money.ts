import feeSchedule from "./config/etsy-fees.json" with { type: "json" };

export interface FeeInputs {
  priceAmount: number;
  shippingAmount?: number;
  sellerCountry?: string; // ISO 3166-1 alpha-2, e.g. "TR"
  soldViaOffsiteAds?: boolean;
  trailingRevenue365dUsd?: number;
}

export interface FeeBreakdown {
  listingFee: number;
  transactionFee: number;
  paymentProcessingFee: number;
  regulatoryOperatingFee: number;
  offsiteAdsFee: number;
  totalEstimatedFees: number;
  /** true if this figure used a fee-schedule fallback rather than a country-specific rate */
  usedDefaults: boolean;
}

/**
 * Estimates Etsy's standard seller fees for a single sale. This is an
 * ESTIMATE for internal profitability tracking — not a tax or accounting
 * document. Rates come from packages/core/src/config/etsy-fees.json, which
 * must be kept in sync with https://www.etsy.com/legal/fees/.
 */
export function estimateEtsyFees(input: FeeInputs): FeeBreakdown {
  const country = input.sellerCountry ?? "default";
  const base = input.priceAmount + (input.shippingAmount ?? 0);
  let usedDefaults = false;

  const regulatoryPctMap = feeSchedule.regulatoryOperatingFeePctByCountry as unknown as Record<string, number>;
  const regulatoryPct = regulatoryPctMap[country] ?? regulatoryPctMap.default ?? 0;
  if (!(country in regulatoryPctMap)) usedDefaults = true;

  const processingMap = feeSchedule.paymentProcessing as unknown as Record<
    string,
    { pct: number; fixed: number }
  >;
  const fallbackProcessing = { pct: 3.0, fixed: 0.25 };
  const processing = processingMap[country] ?? processingMap.default ?? fallbackProcessing;
  if (!(country in processingMap)) usedDefaults = true;

  const listingFee = feeSchedule.listingFeeFlat;
  const transactionFee = round2(base * (feeSchedule.transactionFeePct / 100));
  const paymentProcessingFee = round2(base * (processing.pct / 100) + processing.fixed);
  const regulatoryOperatingFee = round2(base * (regulatoryPct / 100));

  let offsiteAdsFee = 0;
  if (input.soldViaOffsiteAds) {
    const isHighVolume =
      (input.trailingRevenue365dUsd ?? 0) >= feeSchedule.offsiteAdsFeePct.highVolumeThresholdUsdTrailing365d;
    const pct = isHighVolume ? feeSchedule.offsiteAdsFeePct.highVolume : feeSchedule.offsiteAdsFeePct.standard;
    offsiteAdsFee = round2(base * (pct / 100));
  }

  const totalEstimatedFees = round2(
    listingFee + transactionFee + paymentProcessingFee + regulatoryOperatingFee + offsiteAdsFee,
  );

  return {
    listingFee,
    transactionFee,
    paymentProcessingFee,
    regulatoryOperatingFee,
    offsiteAdsFee,
    totalEstimatedFees,
    usedDefaults,
  };
}

export function getFeeScheduleMeta(): { version: number; lastVerified: string } {
  return { version: feeSchedule.version, lastVerified: feeSchedule.lastVerified };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
