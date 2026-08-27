# extensions

Use this boundary when a feature should plug into a shared surface without
teaching that surface about the feature's internals.

Shared registry and data-plane contracts live under `host/`. Extension families
may depend on that host boundary, but never on sibling family implementations.

The MCAP Explorer extension supplies optional cloud-path resolution. The shared
Explorer remains HTTP-only until a product entrypoint registers a resolver
through this boundary.

The grid-poster extension supplies optional precomputed raster posters. The
shared grid stays on its memory, IndexedDB, and live-preview tiers until a
product entrypoint registers a provider through this boundary.
