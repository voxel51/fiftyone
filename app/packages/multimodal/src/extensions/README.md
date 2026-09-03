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

The sidebar tray extension registers content into the episode right sidebar,
below its tab shell. A tray takes no props: whether a surface hosts trays at
all is decided where that surface builds its sidebar, so a tray never has to
interpret facts about where it ended up.

The tile media-surface seam (`tiles/media-surfaces.ts`) publishes where each
2D-media tile draws its stream, plus the episode's open-tile/seek/pause
commands. Only views publish; a product entrypoint reads it to overlay a tile's
media or to send the episode back to a stream and a moment. A timeline
contribution may also supply a `rulerOverlay`, rendered over the episode ruler
at the ruler's live label width.

A registry may opt into a `replace` duplicate-id policy when its registration
module is evaluated by a bundler that gives it no disposal hook. Ordering stays
`order`-driven regardless, so replacement never changes placement.
