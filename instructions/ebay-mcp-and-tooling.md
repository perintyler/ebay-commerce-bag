---
name: ebay-mcp-and-tooling
description: >-
  eBay MCP servers and SDKs, official and community. Read when choosing eBay
  tooling.
mode: on-demand
---

# eBay MCP servers & tooling

Survey of eBay MCP servers and agent tooling (verified 2026-09 against each
project's own README and the npm registry).

**The headline is counter-intuitive: the official server cannot do the two
things integration work needs most.** It is read-only in production and does
not support sandbox, so it cannot drive a write spike at all. Pick by
capability, not by provenance — see "Which to pick" below.

## Official: `@ebay/npm-public-api-mcp`

- npm package under eBay's official `@ebay` scope. v1.1.0 (2026-08-14),
  Apache-2.0. Only two releases so far (1.0.9 in Feb, 1.1.0 in Aug) — alive,
  but slow-moving.
- Local **stdio** tool, OpenAPI-driven. It exposes just **two tools** —
  `query_ebay_api` (natural-language search over eBay's OpenAPI specs) and
  `call_ebay_api` (executes a call) — plus an `interpret_user_request` prompt.
  It is a discovery surface, not a per-endpoint toolset.
- **Two hard limits, both from its own README:**
  - *"This release does not officially support the eBay sandbox environment.
    While the `EBAY_API_ENV` configuration exists, we don't support sandbox
    for now."*
  - *"Production Environment Restrictions: REST APIs: Only GET requests are
    supported (read operations only). Write operations: POST, PUT, DELETE are
    not available in production."*
- Auth: `EBAY_CLIENT_ID` + `EBAY_CLIENT_SECRET`, with `EBAY_TOKEN_TYPE`
  (`application` | `user`) and `EBAY_REFRESH_TOKEN` for user mode.
- No hosted/remote variant; nothing in Claude's connectors directory.

Best fit: **reading** production data and answering "what does this endpoint
look like" from the specs. It cannot run the S1–S3 write spikes, and it cannot
touch sandbox.

## Community: `YosefHayim/ebay-mcp`

- https://github.com/YosefHayim/ebay-mcp — its README claims **299 tools over
  270 endpoints, "100% of eBay's Sell API surface"**: Account, Inventory,
  Fulfillment, Marketing, Analytics, Communication, Metadata, Taxonomy, and
  Trading (legacy XML). Treat the coverage claim as the author's, unverified
  here; confirm the specific endpoint you need before depending on it. (Feed /
  LMS reports coverage in particular is worth checking — an earlier read of
  this project found none.)
- **Does the two things the official server cannot**: writes (its README warns
  its tools "may create, revise, refund, end, or otherwise update eBay
  records") and sandbox, via `EBAY_ENVIRONMENT=sandbox`.
- OAuth built in with auto-refresh; client-credentials (~1k req/day) or user
  tokens (10k–50k/day). Runs locally over stdio or local HTTP — credentials
  stay on the machine.
- Setup wizard (`npm run setup`) auto-configures nine clients including
  Claude Code CLI (`~/.claude.json`).
- MIT, ~149 stars, tests + CI, active. **Unofficial** — explicitly not
  affiliated with eBay, provided as-is. Its own README says test in sandbox
  before production.

**The risk is real and asymmetric.** This is an unvetted third party whose
mutating tools can end listings — and ending is destructive on eBay (relist
loses history, watchers, ranking). Keep `EBAY_ENVIRONMENT=sandbox` unless
production is the deliberate, reviewed goal.

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
