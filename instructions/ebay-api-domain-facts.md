---
name: ebay-api-domain-facts
description: >-
  Verified eBay Sell-API contract facts — the two listing models and routed
  writes, Trading quantity semantics, Out-of-Stock Control, getOrders polling
  gotchas. Read before eBay API code.
mode: on-demand
---

# eBay Sell-API domain facts

Hard-won, verified facts about eBay's seller APIs. Each was confirmed against
official docs, eBay KB articles, or community reports while building a
production inventory-and-orders integration (2026-09). Cite this file instead
of re-researching.

## The two listing models (the gating design constraint)

Every eBay listing is managed under exactly ONE of two models, and writes to
the wrong one fail:

- **Trading model** — listings created via Seller Hub UI or the legacy Trading
  API (XML). The overwhelming majority of existing sellers' listings.
- **Inventory model** — listings created via the Sell Inventory API
  (InventoryItem/Offer objects).

Consequences:

- Trading-model listings are **invisible** to the Inventory API:
  `getInventoryItem` returns error **25710** ("We didn't find the
  resource/entity you are requesting") for them, and `bulkUpdatePriceQuantity`
  cannot address them.
- Inventory-model listings **cannot be revised via Trading** calls
  (`ReviseInventoryStatus`, `ReviseItem`, `ReviseFixedPriceItem`).
- Migration (`bulkMigrateListing`) is one-way, requires fixed-price + SKUs on
  every variation + business policies, and **locks the listing out of Seller
  Hub editing** — a reason to NOT migrate when the seller still manages
  listings by hand.
- Therefore: **route every write by a persisted per-listing model flag**
  (probe once via getInventoryItem 200-vs-25710, default to `trading` — the
  safe assumption), and **never trust a bare 200** — eBay write calls can
  return success without applying the change; read the value back and compare.

## Trading quantity semantics

Trading's `<Quantity>` is the **TOTAL listed** quantity, not available:

    available = Quantity − SellingStatus.QuantitySold

So to leave N units available on a listing that has already sold S, write
`Quantity = N + S`. Read-backs must convert to available terms too, or they
"confirm" the wrong number. (The Inventory API is natively available-based —
no adjustment there.)

`ReviseInventoryStatus` revises price/quantity only, up to 4 items per call,
and publishes faster than the ReviseItem family.

## Out-of-Stock Control

A seller-account preference, not per-listing:

- **ON**: quantity 0 on a GTC (Good-'Til-Cancelled) listing **HIDES** it —
  the listing stays alive (retaining sales history/watchers) but unbuyable.
  Note GTC listings renew monthly and each renewal bills an insertion fee
  where applicable.
- **OFF**: quantity 0 **ENDS** the listing. Ending is destructive (relist is
  a new listing).

Therefore any quantity-0 push MUST be hard-gated on the preference being
verified ON. Read/write it via the Trading `GetUserPreferences` /
`SetUserPreferences` (`OutOfStockControlPreference`).

## getOrders (Fulfillment API) polling

- `limit` defaults to **50**, max **1000**. Use 1000 for polls.
- No order-created webhook exists — orders are pulled, not pushed.
- Filter by `lastmodifieddate:[start..end]`.
- **Gotcha (community-confirmed):** eBay bumps `lastModifiedDate` on
  years-old orders (e.g. buyer account deletions), so ancient orders can
  resurface through the filter. Poll consumers must be idempotent
  (upsert by orderId) and tolerant of stale orders reappearing.
- **Cursor rule:** advance the poll cursor to the run's START time minus an
  overlap window (≥10 minutes), never to completion time — an order becoming
  visible mid-run is older than a completion-time cursor and would be skipped
  forever. Idempotent upserts make the overlap free.
- A raised `lastModifiedDate` also means dedupe within a poll run by
  `orderId` (an order modified mid-poll can appear on two pages).

## Marketplace account-deletion endpoint (compliance)

Required for any production keyset. Two halves:

- **GET challenge handshake:**
  `challengeResponse = hex(sha256(challengeCode + verificationToken + endpointURL))`
  returned as JSON `{"challengeResponse": "..."}`. Concatenation order
  matters and the endpoint URL must byte-match the registered one.
  Verification token: 32–80 chars, alphanumeric plus `_` and `-` only.
- **POST notifications** are signed; verify the signature (public key fetched
  from eBay's Notification API, cacheable) and fail closed — this endpoint
  deletes merchant data.
- Delivery failures are retried; **24h of failures marks the endpoint down
  and starts a 30-day clock toward keyset non-compliance** (keyset can be
  revoked). Alert on failures immediately.

## Rate limits (defaults, per application/day)

| API | Limit |
|---|---|
| Inventory | 2,000,000 |
| Fulfillment | 100,000–250,000 (per method) |
| Feed | 100,000 |
| Account | 25,000 |
| Finances | 15,000 |
| User-token minting | 10,000–50,000 |

Generous for sync workloads; the Application Growth Check raises them.

## SKU as identity

On eBay a variation's SKU is the seller-assigned identity used to address
inventory writes. Renaming a SKU on a Trading listing is effectively
delete+create of the variation. For Trading-model listings the durable
identity is **ItemID + normalized VariationSpecifics**; carry SKU as a
mutable attribute rather than the primary key.

## SDKs

- **No official Ruby SDK exists.** Hand-rolled clients are the norm in Ruby.
- Official Node references worth diffing against:
  - `event-notification-nodejs-sdk` — eBay's reference implementation of the
    deletion-notification challenge/signature flow.
  - `ebay-oauth-nodejs-client` — official OAuth token client (mint/refresh).
- OAuth: standard authorization-code grant with client secret; no PKCE.
  Access tokens ~2h, refresh tokens ~18 months. eBay does not rotate refresh
  tokens on use.
