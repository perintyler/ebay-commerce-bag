/**
 * Tests for the semantics that are wrong by default.
 *
 * Neither eBay sandbox nor production is reachable from CI, so these run against
 * recorded response shapes. That is deliberate: the risk here is not "did the
 * HTTP call work" but "did we read the number correctly", and the latter is
 * exactly what a fixture pins.
 */

import { describe, it, expect } from "vitest";
import {
  ERR_NOT_FOUND,
  isNotFoundError,
  optionalField,
  parseOutOfStockControl,
  tradingAvailableQuantity,
} from "./client.js";

describe("tradingAvailableQuantity", () => {
  // The bug this exists to prevent: reporting Quantity as availability.
  it("subtracts sold from the total listed quantity", () => {
    expect(tradingAvailableQuantity(10, 4)).toBe(6);
  });

  it("differs from the raw quantity whenever anything has sold", () => {
    const quantity = 10;
    const sold = 4;
    expect(tradingAvailableQuantity(quantity, sold)).not.toBe(quantity);
  });

  it("treats an oversold listing as zero, never negative", () => {
    expect(tradingAvailableQuantity(3, 5)).toBe(0);
  });

  it("defaults sold to zero when the field is absent", () => {
    expect(tradingAvailableQuantity(7)).toBe(7);
  });
});

describe("isNotFoundError", () => {
  it("recognizes 25710 at the top level", () => {
    expect(isNotFoundError({ errorId: ERR_NOT_FOUND })).toBe(true);
  });

  it("recognizes 25710 nested in an errors array", () => {
    expect(isNotFoundError({ errors: [{ errorId: 25710, message: "not found" }] })).toBe(true);
  });

  it("recognizes 25710 arriving as a string", () => {
    expect(isNotFoundError({ errorId: "25710" })).toBe(true);
  });

  // A different error must NOT be swallowed as "this is a Trading listing" —
  // that would report a real outage as a routing answer.
  it("rejects other error ids", () => {
    expect(isNotFoundError({ errorId: 500 })).toBe(false);
    expect(isNotFoundError({ errors: [{ errorId: 2001 }] })).toBe(false);
  });

  it("rejects non-error values", () => {
    expect(isNotFoundError(null)).toBe(false);
    expect(isNotFoundError("25710")).toBe(false);
  });
});

describe("parseOutOfStockControl", () => {
  it("reads a real boolean", () => {
    expect(parseOutOfStockControl({ OutOfStockControlPreference: true })).toBe(true);
  });

  // Trading is XML, so booleans routinely arrive as strings.
  it("reads the string form Trading actually returns", () => {
    expect(parseOutOfStockControl({ OutOfStockControlPreference: "true" })).toBe(true);
    expect(parseOutOfStockControl({ OutOfStockControlPreference: "false" })).toBe(false);
  });

  // Fail toward the state that makes a caller stop. Reporting an unknown
  // preference as ON would green-light a push that ends listings.
  it("reads an absent or unparseable preference as OFF", () => {
    expect(parseOutOfStockControl({})).toBe(false);
    expect(parseOutOfStockControl(undefined)).toBe(false);
    expect(parseOutOfStockControl({ OutOfStockControlPreference: "yes" })).toBe(false);
  });
});

describe("optionalField", () => {
  it("passes real values through, including falsy ones", () => {
    expect(optionalField("buyer1")).toBe("buyer1");
    expect(optionalField(0)).toBe(0);
    expect(optionalField(false)).toBe(false);
  });

  // Role-gated PII arrives absent, not as an error.
  it("normalizes absent to null", () => {
    expect(optionalField(undefined)).toBeNull();
    expect(optionalField(null)).toBeNull();
  });
});
