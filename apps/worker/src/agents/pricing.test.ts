import { describe, expect, it } from "vitest";
import { clampPrice } from "./pricing.js";

describe("clampPrice", () => {
  it("clamps below the minimum", () => {
    expect(clampPrice(1.5, 3, 45)).toBe(3);
  });
  it("clamps above the maximum", () => {
    expect(clampPrice(99, 3, 45)).toBe(45);
  });
  it("passes through and rounds to cents within range", () => {
    expect(clampPrice(12.3456, 3, 45)).toBe(12.35);
  });
});
