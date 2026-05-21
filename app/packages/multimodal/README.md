# `@fiftyone/multimodal`

App-side package for multimodal data loading, decoding, and visualization.

## Layer Contracts

### Resources

Resources cover byte-range reads, decode execution, and bounded cache contracts
under `src/client/resources`.

While resources are source-agnostic: a byte range is just `{ source, range }`,
and a decode request is just `{ payload, bytes, context }`. **Adapters** decide
which ranges to read and which payload descriptors to decode.

### Adapters

Adapters compose resources for a concrete source format. The MCAP adapter under
`src/adapters/mcap` owns MCAP indexing, chunk decompression, channel/schema
mapping, direct topic metadata reads, sync-window selection, worker playback,
and adapter-owned decoder registration. Its public surface presents
playback-ready APIs.

## Runtime Flow for Synchronized Playback

1. Playback driver derives an MCAP byte source from the sample filepath and
   creates a worker-backed MCAP resource client.
2. The MCAP resource client initializes an `@mcap/core` indexed reader over app
   media byte-range URLs, using the raw byte cache and decompression handlers.
3. Grid and modal renderers ask the MCAP reader summary for topic metadata via
   `readTopics(...)`; the modal asks the same source for the active timeline
   range via `readTimelineRange(...)`.
4. The driver then reads synchronized windows with
   `readSynchronizedMessages(...)` for load/seek and
   `readSynchronizedMessageBatch(...)` for playback lookahead.
5. MCAP messages are mapped to generic payload descriptors and decoded through
   the decode resource client.
6. Decoded visualization outputs are cached and rendered by source-agnostic
   panels.

## Worker Playback

Playback uses `src/adapters/mcap/worker` so MCAP scans, decompression, and
payload decoding do not block the main UI thread. The worker owns the same MCAP
resource client as inline execution, but exposes it through prioritized RPC:

-   current-frame requests run before speculative playback batches,
-   streaming reads return incremental values to the main thread,
-   transferable buffers move decoded image/point-cloud data without extra
    copies

## Decompression

The adapter delegates MCAP chunk decompression (usually zstd or lz4) to
Foxglove's browser WASM codec packages.

## Caching

Caching is split by ownership. The core media path has three architectural
caches, described below.

### Core Media Path

1. **Raw byte-range cache**

    `src/client/resources` keeps a bounded in-memory LRU of byte-range reads by
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
