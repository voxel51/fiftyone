# query

Query turns source-neutral requests into bytes or decoded results. It owns
caching, range reuse, request coalescing, cancellation, and network-aware
resource behavior. Adapters tell it what to fetch; runtime policy decides when
the result is needed.

Keep format interpretation and product scheduling out. Query should be useful
to any adapter and predictable enough that higher layers can reason about cost
without knowing the transport.

Three nearby namespaces serve different stages. Codecs inspect or normalize
bitstreams. Decoders perform stateless payload-to-IR transformations. Query's
decoding domain manages the request lifecycle around those transformations,
including caching and coalescing decoded results. It orchestrates decoders; it
does not define another decoder contract.
