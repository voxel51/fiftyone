# `@fiftyone/multimodal`

App-side package for multimodal data loading, decoding, and visualization.

## Layer Contracts

### IR and ports

Cloneable frame, stream, manifest, and time values live in `src/ir`; that
directory is a dependency leaf. Method-bearing provider contracts live in
`src/ports` and may import only IR values. `FormatAdapter.open(...)` returns a
pull-based `EpisodeSession` with four read-priority lanes, canonical
cancellation, optional semantic capabilities, and optional equivalent fast
paths.

### Resources

Resources cover byte-range reads, decode execution, and bounded cache contracts
under `src/query/bytes` and `src/query/decode`.

While resources are source-agnostic: a byte range is just `{ source, range }`,
and a decode request is just `{ payload, bytes, context }`. **Adapters** decide
which ranges to read and which payload descriptors to decode.

### Adapters

Adapters compose resources for a concrete source format. The MCAP adapter under
`src/adapters/mcap` owns MCAP indexing, chunk decompression, channel/schema
mapping, direct topic metadata reads, worker-accelerated playback, and
adapter-owned decoder registration. It implements the shared format port; it
does not own React views or shared runtime policy.

`src/adapters/fixture` is the deterministic contract/performance source and
covers every public stream kind, cancellation, priority, backpressure, and
failure containment. `src/adapters/lerobot` is the structurally different port
validator: it reads LeRobot episode Parquet through byte resources and emits
MP4 samples as encoded-video IR without introducing topic or message-log
concepts into the port. It intentionally remains contract-only until a later PR
defines production multi-asset source acquisition and renderer activation.

### Runtime and views

`src/runtime` owns format-neutral demand, time-window, stream-context,
transport, adapter-registry, and acceleration-fallback policy. The feature-rich
React shell lives under `src/views/episode` and consumes IR/session
capabilities without importing an adapter. Its registration entry uses lazy
components, while `src/views/mcap-explorer` is the explicit MCAP
source-acquisition composition surface. Timeline product extensions live under
`src/extensions/timeline`, and the grid's temporal-tag overlay is exported from
`src/temporal-tags/grid-overlay`.

`EpisodeSessionRenderer` is the smallest adapter-neutral modal/grid proof. Its
dependency rule forbids even a transitive reach into `src/adapters`, and its
tests run against the fixture session. The production shell follows the same
boundary: its tile catalog, playback driver, settings, grid preview, and modal
consume stream IDs and optional session capabilities. Adapter-owned code is
passive and UI-free.

## Adapter-Neutral Runtime Flow

1. The composition root detects the sample with a lightweight adapter
   descriptor and lazily loads the matching `FormatAdapter`.
2. The adapter resolves episode assets over the shared byte-resource port. MCAP
   initializes an `@mcap/core` indexed reader; LeRobot reads Parquet and MP4
   assets.
3. Opening the adapter produces a format-neutral episode manifest and session.
4. Runtime policy requests inclusive time windows through `read(...)`, using
   synchronized or transform accelerations only when their results match the
   shared fallbacks.
5. Format records are mapped to `DecodedFrame` values. MCAP payloads use the
   decode resource client; LeRobot video samples remain browser-decodable
   encoded-video IR.
6. Cloneable visualization outputs flow through runtime contexts to the shared
   panels; numeric-series and raw-record UI feature-detect their semantic
   capabilities.

This flow is exercised end-to-end through the production modal, grid, and
timeline consumers by the fixture adapter, and at the port/contract level by
MCAP and LeRobot. The dependency graph keeps the renderer/runtime side unable
to reach an adapter.

## Worker Playback

The MCAP adapter uses `src/adapters/mcap/worker` so scans, decompression, and
payload decoding do not block the main UI thread. This implementation remains
private behind the episode session and exposes its proven prioritized RPC:

- current-frame requests run before speculative playback batches,
- streaming reads return incremental values to the main thread,
- transferable buffers move decoded image/point-cloud data without extra copies

## Decompression

The adapter delegates MCAP chunk decompression (usually zstd or lz4) to
Foxglove's browser WASM codec packages.

## Caching

Caching is split by ownership. The core media path has three architectural
caches, described below.

### Core Media Path

1. **Raw byte-range cache**

    `src/query/bytes` keeps a bounded in-memory LRU of byte-range reads by
    source identity and half-open range. This is the durable, format-agnostic
    media cache. MCAP uses it through `ByteClientReadable`, but the cache
    itself knows only about byte sources and ranges.

    The cached byte client normalizes most small reads into source-aware fill
    blocks before checking the cache. Local/unknown sources use smaller fill
    blocks, while remote/object-storage sources use larger blocks to reduce
    round trips. A later subrange read can be sliced from the cached fill
    block.

2. **MCAP reader and index caches**

    `src/adapters/mcap/reader` owns initialized MCAP readers per source. The
    reader store prevents each playback request from rebuilding the MCAP
    reader, reparsing summary metadata, and recreating the seekable reader
    wrapper.

    The default reader also gives `@mcap/core` a message-index cache budget.
    That cache is owned by the MCAP library, but the adapter sets the budget
    because indexed message-time reads are on the playback hot path.

3. **Synchronized playback-window cache**

    A playback window is the resolved answer for one frame: source, active
    timeline, frame time, playback topics, and sync policies. This cache is
    controller-policy-shaped, so it belongs with the playback driver.
