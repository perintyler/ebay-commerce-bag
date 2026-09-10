# ebay-commerce bag

Selling on eBay through the Sell APIs — the contract facts that shape an
inventory-and-orders integration, and the runbooks for proving them.

Named for the domain rather than the vendor: this is seller-side integration
engineering, not everything eBay.

Everything reaches an agent through Barry's own primitives, so there is nothing
to read out of this directory by hand:

- **Instructions** (`search_instructions` / `get_instructions`) —
  `ebay-api-domain-facts` is the load-bearing one: the two listing models and
  why every write must be routed, Trading's total-vs-available quantity
  semantics, Out-of-Stock Control as the gate on any quantity-0 push, and the
  getOrders polling gotchas. `ebay-mcp-and-tooling` surveys the servers and SDKs.
- **Tools** (namespace `ebay`) — read-only, and deliberately so. `get_orders`
  polls the Fulfillment API; `get_listing` reads an inventory item *and*
  identifies which listing model owns the SKU (eBay's error 25710 is the
  answer, not a failure); `get_oos_control` reads the Out-of-Stock Control
  preference that every quantity-0 push depends on; `status` reports
  connectivity without throwing.

  There is no write path. Ending a listing is destructive on eBay — a relist
  loses history, watchers and ranking — so writes get their own design, with
  staging and explicit approval, rather than arriving as a side effect of
  adding reads.

  Credentials (`EBAY_CLIENT_ID`, `EBAY_CERT_ID`, `EBAY_REFRESH_TOKEN`) resolve
  per-barry from the vault and never reach the model. `EBAY_ENV=sandbox`
  switches endpoints.

- **Actions** (`find_actions` / `use_action`) — `sandbox-validation` runs the
  S1–S5 spikes and the deletion-endpoint handshake; `ebay-mcp-setup` wires an
  eBay MCP server into a session.

The domain facts were verified against official docs, eBay KB articles and
community reports while building a production integration in 2026-09. They are
dated by nature: eBay changes endpoints without version bumps, so treat the
facts as a strong prior and re-check anything load-bearing.
