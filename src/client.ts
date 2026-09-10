/**
 * eBay client construction and the response shaping that carries real risk.
 *
 * The pure functions below are exported and tested directly. Each encodes a
 * documented eBay behavior where the obvious reading of a response is wrong —
 * see the `ebay-api-domain-facts` instruction in this bag.
 */

import eBayApi from "ebay-api";
import type { ToolContext } from "@barry-rocks/tools";

export const EBAY_SECRETS = ["EBAY_CLIENT_ID", "EBAY_CERT_ID", "EBAY_REFRESH_TOKEN"];

/**
 * eBay's "we didn't find the resource" error.
 *
 * On getInventoryItem this is not a failure — it is the answer. Trading-model
 * listings are invisible to the Inventory API, so 25710 identifies the model
 * rather than reporting a problem.
 */
export const ERR_NOT_FOUND = 25710;

export type ListingModel = "inventory" | "trading";

/** Environment is config, not a secret: it selects an endpoint, it grants nothing. */
function isSandbox(): boolean {
  const env = (process.env.EBAY_ENV ?? "production").toLowerCase();
  return env === "sandbox";
}

export function probeCredentials(context?: ToolContext): {
  client: eBayApi | null;
  missing: string[];
} {
  const missing: string[] = [];
  const appId = context?.secrets.EBAY_CLIENT_ID;
  const certId = context?.secrets.EBAY_CERT_ID;
  const refreshToken = context?.secrets.EBAY_REFRESH_TOKEN;

  if (!appId) missing.push("EBAY_CLIENT_ID");
  if (!certId) missing.push("EBAY_CERT_ID");
  if (!refreshToken) missing.push("EBAY_REFRESH_TOKEN");
  if (missing.length > 0) return { client: null, missing };

  return { client: buildClient(appId!, certId!, refreshToken!), missing: [] };
}

// Cached per credential triple. Secrets are re-resolved every turn and differ
// per barry, so a plain singleton would serve one barry's client to another.
let cached: eBayApi | null = null;
let cachedKey: string | null = null;

function buildClient(appId: string, certId: string, refreshToken: string): eBayApi {
  const key = `${appId}:${certId}:${refreshToken}:${isSandbox()}`;
  if (cached && cachedKey === key) return cached;

  const api = new eBayApi({ appId, certId, sandbox: isSandbox() });
  api.OAuth2.setCredentials(refreshToken);
  cached = api;
  cachedKey = key;
  return api;
}

export function requireClient(context?: ToolContext): eBayApi {
  const { client, missing } = probeCredentials(context);
  if (!client) {
    // Wording matters: packages/tools/src/register.ts matches this shape to
    // append the `barry vault set-env` remediation.
    throw new Error(
      `Missing required secrets: ${missing.join(", ")}. Add them to the active barry's secrets.`,
    );
  }
  return client;
}

/** True when an error is eBay's 25710 — reported inconsistently across APIs. */
export function isNotFoundError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const e = error as Record<string, any>;
  const codes = [
    e.errorId,
    e.errorCode,
    e.meta?.errorId,
    ...(Array.isArray(e.errors) ? e.errors.map((x: any) => x?.errorId) : []),
    ...(Array.isArray(e.meta?.errors) ? e.meta.errors.map((x: any) => x?.errorId) : []),
  ];
  return codes.some((c) => Number(c) === ERR_NOT_FOUND);
}

/**
 * Shape a getInventoryItem response into the model verdict callers route on.
 *
 * Exported and tested because this is the routing decision, not a formatting
 * detail: `trading` means the Inventory API cannot address this SKU at all, and
 * every later write has to go through the Trading API instead.
 */
export function shapeInventoryItem(sku: string, item: Record<string, any> | null) {
  return {
    sku,
    model: "inventory" as ListingModel,
    // The Inventory API is natively available-based, unlike Trading.
    availableQuantity: optionalField(item?.availability?.shipToLocationAvailability?.quantity),
    condition: optionalField(item?.condition),
    title: optionalField(item?.product?.title),
  };
}

/** The verdict for a SKU the Inventory API cannot see (error 25710). */
export function tradingModelVerdict(sku: string) {
  return {
    sku,
    model: "trading" as ListingModel,
    availableQuantity: null,
    note:
      "Not addressable via the Inventory API (error 25710) — this SKU belongs to a " +
      "Trading-model listing. Route reads and writes through the Trading API, where " +
      "Quantity is the TOTAL listed and available = Quantity - QuantitySold.",
  };
}

/**
 * Trading's `Quantity` is the TOTAL ever listed, not what a buyer can buy:
 *
 *     available = Quantity - QuantitySold
 *
 * Reporting `Quantity` as availability overstates it by everything already
 * sold, and a read-back that skips this "confirms" a number nobody can buy.
 * The Inventory API is natively available-based and needs no adjustment.
 */
export function tradingAvailableQuantity(quantity: number, quantitySold = 0): number {
  const available = quantity - quantitySold;
  return available > 0 ? available : 0;
}

/**
 * Out-of-Stock Control is an account preference, and it decides whether a
 * quantity-0 push HIDES a listing or ENDS it. Ending is destructive — a relist
 * is a new listing that loses history, watchers and ranking.
 *
 * Absent or unparseable reads as OFF: the unsafe state is the safe default to
 * report, because it is the one that makes a caller stop.
 */
export function parseOutOfStockControl(response: unknown): boolean {
  const prefs = (response as Record<string, any>)?.OutOfStockControlPreference;
  if (typeof prefs === "boolean") return prefs;
  return String(prefs).toLowerCase() === "true";
}

/**
 * Buyer PII is role-gated and comes back ABSENT rather than as an error when
 * a keyset lacks the grant. Every consumer must degrade to null instead of
 * raising, or an ungranted field reads as a broken integration.
 */
export function optionalField<T>(value: T | undefined | null): T | null {
  return value === undefined || value === null ? null : value;
}
