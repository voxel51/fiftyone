# query

This is the data acquisition engine.

Query turns source-neutral requests into bytes or decoded results. It owns
caching, range reuse, request coalescing, cancellation, and network-aware
resource behavior. Adapters tell it what to fetch; runtime policy decides when
the result is needed.

Keep format interpretation and product scheduling out. Query should be useful
to any adapter and predictable enough that higher layers can reason about cost
without knowing the transport.
