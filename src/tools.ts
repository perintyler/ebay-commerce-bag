/**
 * eBay Sell-API read tools.
 *
 * Read-only by construction. Every destructive hazard this bag documents —
 * a quantity-0 push ending a listing, a bare 200 that did not apply — lives on
 * the write path, so there is no write path here. See the bag README.
 *
 * The tools are task-shaped rather than one-per-endpoint: `get_listing` also
 * answers "which listing model is this?", because that single question decides
 * how every later write must be routed.
 */

import { defineTool, type ToolContext } from "@barry-rocks/tools";
import { z } from "zod";
import {
  EBAY_SECRETS,
  isNotFoundError,
  optionalField,
  parseOutOfStockControl,
  probeCredentials,
  requireClient,
  tradingAvailableQuantity,
  type ListingModel,
} from "./client.js";

export const status = defineTool({
  namespace: "ebay",
  access: "read",
  name: "status",
  description:
    "Check eBay API connectivity and which environment (sandbox or production) is configured.",
  secrets: EBAY_SECRETS,
  schema: {},
  // Returns a structured verdict instead of throwing: a disconnected bag that
  // raises looks identical to a broken one, and the agent needs to tell them
  // apart to know whether to ask for credentials.
  handler: async (_params, context?: ToolContext) => {
    const env = (process.env.EBAY_ENV ?? "production").toLowerCase();
    const { client, missing } = probeCredentials(context);
    if (!client) return { status: "disconnected", environment: env, missing };
    try {
      await client.OAuth2.getAccessToken();
      return { status: "connected", environment: env };
    } catch (e) {
      return { status: "error", environment: env, error: e instanceof Error ? e.message : String(e) };
    }
  },
  cliFormat: (r: any) =>
    r.status === "connected"
      ? `connected (${r.environment})`
      : r.status === "disconnected"
        ? `disconnected (${r.environment}) — missing: ${r.missing.join(", ")}`
        : `error (${r.environment}): ${r.error}`,
});

export const getOrders = defineTool({
  namespace: "ebay",
  access: "read",
  name: "get_orders",
  description:
    "List eBay orders via the Fulfillment API. Filter by last-modified window for polling. " +
    "Note eBay bumps lastModifiedDate on years-old orders, so a window can resurface ancient " +
    "orders — consumers must be idempotent.",
  secrets: EBAY_SECRETS,
  schema: {
    modifiedAfter: z
      .string()
      .optional()
      .describe("ISO-8601 start of a lastmodifieddate window, e.g. 2026-09-01T00:00:00.000Z"),
    modifiedBefore: z.string().optional().describe("ISO-8601 end of the lastmodifieddate window"),
    orderIds: z.array(z.string()).optional().describe("Specific order ids to fetch instead of a filter"),
    // eBay's own default is 50; 1000 is the max and the right choice for a poll.
    limit: z.number().int().min(1).max(1000).optional().describe("Max orders to return (1-1000, default 1000)"),
  },
  handler: async ({ modifiedAfter, modifiedBefore, orderIds, limit }, context?: ToolContext) => {
    const client = requireClient(context);
    const params: Record<string, unknown> = { limit: limit ?? 1000 };
    if (orderIds?.length) {
      params.orderIds = orderIds.join(",");
    } else if (modifiedAfter) {
      const end = modifiedBefore ?? "";
      params.filter = `lastmodifieddate:[${modifiedAfter}..${end}]`;
    }
    const res: any = await client.sell.fulfillment.getOrders(params as any);
    const orders = (res?.orders ?? []).map((o: any) => ({
      orderId: o.orderId,
      creationDate: o.creationDate,
      lastModifiedDate: o.lastModifiedDate,
      orderFulfillmentStatus: o.orderFulfillmentStatus,
      orderPaymentStatus: o.orderPaymentStatus,
      // PII is role-gated and arrives absent rather than as an error.
      buyerUsername: optionalField(o.buyer?.username),
      total: optionalField(o.pricingSummary?.total),
      lineItems: (o.lineItems ?? []).map((li: any) => ({
        lineItemId: li.lineItemId,
        sku: optionalField(li.sku),
        title: li.title,
        quantity: li.quantity,
      })),
    }));
    return { total: res?.total ?? orders.length, count: orders.length, orders };
  },
  cliFormat: (r: any) =>
    r.orders.length === 0
      ? "no orders"
      : r.orders
          .map((o: any) => `${o.orderId}  ${o.orderFulfillmentStatus}  ${o.lineItems.length} item(s)`)
          .join("\n"),
});

export const getListing = defineTool({
  namespace: "ebay",
  access: "read",
  name: "get_listing",
  description:
    "Read an eBay inventory item by SKU, and identify which listing model owns it. " +
    "A Trading-model listing (created in Seller Hub or via the legacy API) is invisible to the " +
    "Inventory API — this reports model 'trading' rather than failing. The model decides how a " +
    "later write must be routed.",
  secrets: EBAY_SECRETS,
  schema: { sku: z.string().min(1).describe("The seller-defined SKU to look up") },
  handler: async ({ sku }, context?: ToolContext) => {
    const client = requireClient(context);
    try {
      const item: any = await client.sell.inventory.getInventoryItem(sku);
      const model: ListingModel = "inventory";
      return {
        sku,
        model,
        // The Inventory API is natively available-based — no conversion here.
        availableQuantity: optionalField(item?.availability?.shipToLocationAvailability?.quantity),
        condition: optionalField(item?.condition),
        title: optionalField(item?.product?.title),
      };
    } catch (e) {
      if (isNotFoundError(e)) {
        const model: ListingModel = "trading";
        return {
          sku,
          model,
          availableQuantity: null,
          note:
            "Not addressable via the Inventory API (error 25710) — this SKU belongs to a " +
            "Trading-model listing. Route reads and writes through the Trading API, where " +
            "Quantity is the TOTAL listed and available = Quantity - QuantitySold.",
        };
      }
      throw e;
    }
  },
  cliFormat: (r: any) =>
    `${r.sku}  model=${r.model}  available=${r.availableQuantity ?? "n/a"}${r.note ? `\n${r.note}` : ""}`,
});

export const getOutOfStockControl = defineTool({
  namespace: "ebay",
  access: "read",
  name: "get_oos_control",
  description:
    "Read the account's Out-of-Stock Control preference. This is the gate every quantity-0 push " +
    "depends on: with it ON, quantity 0 HIDES a GTC listing; with it OFF, quantity 0 ENDS the " +
    "listing, which is destructive (a relist loses history, watchers and ranking).",
  secrets: EBAY_SECRETS,
  schema: {},
  handler: async (_params, context?: ToolContext) => {
    const client = requireClient(context);
    const res: any = await client.trading.GetUserPreferences({
      ShowOutOfStockControlPreference: true,
    });
    const enabled = parseOutOfStockControl(res);
    return {
      outOfStockControl: enabled,
      quantityZeroBehavior: enabled ? "hides the listing" : "ENDS the listing (destructive)",
      safeToPushZero: enabled,
    };
  },
  cliFormat: (r: any) =>
    `out-of-stock control: ${r.outOfStockControl ? "ON" : "OFF"} — quantity 0 ${r.quantityZeroBehavior}`,
});
