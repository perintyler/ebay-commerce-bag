---
name: ebay-mcp-and-tooling
description: >-
  eBay MCP servers and SDKs, official and community. Read when choosing eBay
  tooling.
mode: on-demand
---

# eBay MCP servers & tooling

Survey of eBay MCP servers and agent tooling (verified 2026-09). Use the
official server for API exploration/validation work; vet the community one
before pointing seller credentials at it.

## Official: `@ebay/npm-public-api-mcp`

- npm package under eBay's official `@ebay` scope. v1.1.0, Apache-2.0.
  Verified on npm: "MCP server for eBay API with OpenAPI support".
- Local **stdio** developer tool: OpenAPI-driven API discovery, documentation
  browsing, and **live API calls with your own OAuth token**.
- Built for developers exercising eBay's APIs — not a turnkey seller
  assistant. No hosted/remote MCP exists; nothing in Claude's connectors
  directory.
- Install: `npm i -g @ebay/npm-public-api-mcp`, then register as a stdio MCP
  server in your client (see the `ebay-mcp-setup` action).

Best fit: sandbox validation and spike work — driving getInventoryItem /
bulkUpdatePriceQuantity / getOrders etc. as tools instead of hand-writing
curl/scripts.

## Community: `YosefHayim/ebay-mcp`

- https://github.com/YosefHayim/ebay-mcp — 299 tools over 270 Sell API
  endpoints: Inventory, Fulfillment (getOrders), Trading (legacy XML),
  Marketing, Analytics, Account. **No Feed API / LMS reports coverage.**
- OAuth built in with auto-refresh; client-credentials (~1k req/day) or user
  tokens (10k–50k/day). **Sandbox/production switch via `EBAY_ENVIRONMENT`.**
- Setup wizard (`npm run setup`) auto-configures nine clients including
  Claude Code CLI (`~/.claude.json`).
- MIT, ~149 stars, 1,000+ tests, CI, active. **Unofficial** — explicitly not
  affiliated with eBay. Vet before production keys; mutating tools can alter
  live seller data. Prefer sandbox.

## Not relevant (buyer-side)

- `KalGuinn/ebay-mcp` — read-only Browse API, deal-hunting.
- `hanku4u/ebay-mcp-server` — search/price tracking.
- Various "eBay listing manager" agent skills — seller listing creation via
  UI-ish flows, not integration engineering.

## Policy note

Effective 2026-02-20, eBay's user agreement prohibits LLM agents completing
**checkout** without permission. Seller-side automation via the official
developer APIs is unaffected.

## Official SDK references (Node)

- `event-notification-nodejs-sdk` — reference implementation for the
  marketplace-account-deletion challenge + signed-notification verification.
- `ebay-oauth-nodejs-client` — official OAuth mint/refresh client.

No official Ruby SDK exists.
