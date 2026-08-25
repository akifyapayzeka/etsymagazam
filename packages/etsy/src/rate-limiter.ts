/**
 * Minimal QPS pacer + daily budget tracker for the Etsy API. Etsy enforces
 * QPS first, then QPD (see constants.ts). We pace requests to never exceed
 * QPS and track a rolling daily count so callers can back off proactively
 * instead of discovering the limit via a 429.
 */
export class RateLimiter {
  private lastRequestAt = 0;
  private dailyCount = 0;
  private dailyWindowStart = Date.now();

  constructor(
    private readonly queriesPerSecond: number,
    private readonly queriesPerDay: number,
  ) {}

  async acquire(): Promise<void> {
    this.rolloverDailyWindowIfNeeded();
    if (this.dailyCount >= this.queriesPerDay) {
      const msUntilReset = 24 * 60 * 60 * 1000 - (Date.now() - this.dailyWindowStart);
      throw new Error(
        `Etsy API daily query budget (${this.queriesPerDay}) exhausted. Resets in ~${Math.ceil(msUntilReset / 60000)}m.`,
      );
    }

    const minIntervalMs = 1000 / this.queriesPerSecond;
    const elapsed = Date.now() - this.lastRequestAt;
    if (elapsed < minIntervalMs) {
      await sleep(minIntervalMs - elapsed);
    }
    this.lastRequestAt = Date.now();
    this.dailyCount += 1;
  }

  private rolloverDailyWindowIfNeeded(): void {
    if (Date.now() - this.dailyWindowStart >= 24 * 60 * 60 * 1000) {
      this.dailyWindowStart = Date.now();
      this.dailyCount = 0;
    }
  }

  get remainingToday(): number {
    this.rolloverDailyWindowIfNeeded();
    return Math.max(0, this.queriesPerDay - this.dailyCount);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
