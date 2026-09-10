# ebay bag

eBay Sell-API integration knowledge — the contract facts that shape an
inventory-and-orders integration, and the runbooks for proving them. No tools,
servers, or credentials; prose and procedures.

Everything reaches an agent through Barry's own primitives, so there is nothing
to read out of this directory by hand:

- **Instructions** (`search_instructions` / `get_instructions`) —
  `ebay-api-domain-facts` is the load-bearing one: the two listing models and
  why every write must be routed, Trading's total-vs-available quantity
  semantics, Out-of-Stock Control as the gate on any quantity-0 push, and the
  getOrders polling gotchas. `ebay-mcp-and-tooling` surveys the servers and SDKs.
- **Actions** (`find_actions` / `use_action`) — `sandbox-validation` runs the
  S1–S5 spikes and the deletion-endpoint handshake; `ebay-mcp-setup` wires an
  eBay MCP server into a session.

The domain facts were verified against official docs, eBay KB articles and
community reports while building a production integration in 2026-09. They are
dated by nature: eBay changes endpoints without version bumps, so treat the
facts as a strong prior and re-check anything load-bearing.
