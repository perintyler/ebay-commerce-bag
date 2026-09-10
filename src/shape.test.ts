/**
 * The listing-model routing verdict.
 *
 * This is the decision every future write depends on: `inventory` means the
 * Sell Inventory API can address the SKU, `trading` means it cannot and the
 * legacy Trading API is the only path. Getting it wrong sends a write at an
 * API that will reject it — or worse, silently accept it against nothing.
 */

import { describe, it, expect } from "vitest";
import { shapeInventoryItem, tradingModelVerdict } from "./client.js";

/** A recorded getInventoryItem 200 for an Inventory-model SKU. */
const INVENTORY_ITEM = {
  sku: "SKU-INV-1",
  condition: "NEW",
  product: { title: "A Widget" },
  availability: { shipToLocationAvailability: { quantity: 7 } },
};

describe("shapeInventoryItem", () => {
  it("reports the inventory model for a SKU the Inventory API can see", () => {
    expect(shapeInventoryItem("SKU-INV-1", INVENTORY_ITEM).model).toBe("inventory");
  });

  // The Inventory API is natively available-based, so the number is used as-is.
  // (Trading is the one needing Quantity - QuantitySold.)
  it("passes the available quantity through without conversion", () => {
    expect(shapeInventoryItem("SKU-INV-1", INVENTORY_ITEM).availableQuantity).toBe(7);
  });

  it("carries condition and title when present", () => {
    const s = shapeInventoryItem("SKU-INV-1", INVENTORY_ITEM);
    expect(s.condition).toBe("NEW");
    expect(s.title).toBe("A Widget");
  });

  it("degrades missing optional fields to null rather than throwing", () => {
    const sparse = shapeInventoryItem("SKU-BARE", { sku: "SKU-BARE" });
    expect(sparse.availableQuantity).toBeNull();
    expect(sparse.condition).toBeNull();
    expect(sparse.title).toBeNull();
    expect(sparse.model).toBe("inventory");
  });

  // Quantity 0 is a real, meaningful value — it must survive as 0, not become
  // null. Whether 0 hides or ENDS a listing is the Out-of-Stock question.
  it("preserves a zero quantity instead of nulling it", () => {
    const zero = shapeInventoryItem("SKU-ZERO", {
      availability: { shipToLocationAvailability: { quantity: 0 } },
    });
    expect(zero.availableQuantity).toBe(0);
  });

  it("tolerates a null item", () => {
    expect(() => shapeInventoryItem("SKU-NULL", null)).not.toThrow();
  });
});

describe("tradingModelVerdict", () => {
  it("reports the trading model", () => {
    expect(tradingModelVerdict("SKU-TRAD").model).toBe("trading");
  });

  // The two verdicts must be distinguishable — a caller routes on this.
  it("differs from the inventory verdict for the same SKU", () => {
    expect(tradingModelVerdict("SKU-X").model).not.toBe(
      shapeInventoryItem("SKU-X", INVENTORY_ITEM).model,
    );
  });

  // Null, not 0: the Inventory API cannot see this listing at all, so we have
  // no quantity. Reporting 0 would read as "out of stock" and could green-light
  // exactly the destructive push this bag warns about.
  it("reports an unknown quantity as null, never zero", () => {
    const v = tradingModelVerdict("SKU-TRAD");
    expect(v.availableQuantity).toBeNull();
    expect(v.availableQuantity).not.toBe(0);
  });

  it("explains the Trading quantity semantics in its note", () => {
    expect(tradingModelVerdict("SKU-TRAD").note).toContain("QuantitySold");
  });
});
