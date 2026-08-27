import { beforeEach, describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.REDIS_URL ??= "redis://localhost:6379";

const findUniqueAutopilotState = vi.fn();
const countProduct = vi.fn();
const create = vi.fn();

vi.mock("@etsymagazam/database", () => ({
  prisma: {
    autopilotState: { findUnique: findUniqueAutopilotState },
    product: { count: countProduct },
    agentDecision: { create },
  },
}));

describe("Store Director gate (integration: kill switch + production limits)", () => {
  beforeEach(() => {
    findUniqueAutopilotState.mockReset();
    countProduct.mockReset();
    create.mockReset();
  });

  it("blocks generation when the kill switch is paused", async () => {
    const { canGenerateMore } = await import("../apps/worker/src/agents/store-director.js");
    findUniqueAutopilotState.mockResolvedValue({ isPaused: true, pausedReason: "Testing", maxProductsPerDay: 10, maxProductsPerWeek: 50 });

    const gate = await canGenerateMore("shop_1");

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/paused/i);
    expect(countProduct).not.toHaveBeenCalled(); // short-circuits before even checking limits
  });

  it("blocks generation once the daily limit is reached", async () => {
    const { canGenerateMore } = await import("../apps/worker/src/agents/store-director.js");
    findUniqueAutopilotState.mockResolvedValue({ isPaused: false, maxProductsPerDay: 3, maxProductsPerWeek: 50 });
    countProduct.mockResolvedValueOnce(3).mockResolvedValueOnce(3); // today, this week

    const gate = await canGenerateMore("shop_1");

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/daily/i);
  });

  it("blocks generation once the weekly limit is reached even if daily has room", async () => {
    const { canGenerateMore } = await import("../apps/worker/src/agents/store-director.js");
    findUniqueAutopilotState.mockResolvedValue({ isPaused: false, maxProductsPerDay: 10, maxProductsPerWeek: 5 });
    countProduct.mockResolvedValueOnce(1).mockResolvedValueOnce(5); // today, this week

    const gate = await canGenerateMore("shop_1");

    expect(gate.allowed).toBe(false);
    expect(gate.reason).toMatch(/weekly/i);
  });

  it("allows generation when running and within all limits", async () => {
    const { canGenerateMore } = await import("../apps/worker/src/agents/store-director.js");
    findUniqueAutopilotState.mockResolvedValue({ isPaused: false, maxProductsPerDay: 3, maxProductsPerWeek: 10 });
    countProduct.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    const gate = await canGenerateMore("shop_1");

    expect(gate.allowed).toBe(true);
  });
});

describe("Store Director opportunity distinctness", () => {
  it("treats SEO variants of the same product as duplicates", async () => {
    const { isDistinctOpportunityTitle } = await import("../apps/worker/src/agents/store-director.js");

    expect(
      isDistinctOpportunityTitle("monthly budget planner printable", [
        "Monthly Budget Planner Printable | Finance Tracker PDF | Savings & Expense Planner | Instant Download",
      ]),
    ).toBe(false);
  });

  it("allows a different printable theme", async () => {
    const { isDistinctOpportunityTitle } = await import("../apps/worker/src/agents/store-director.js");

    expect(isDistinctOpportunityTitle("weekly meal planner and grocery list printable", ["Monthly Budget Planner Printable"])).toBe(true);
  });
});
