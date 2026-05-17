# `@fiftyone/multimodal`

App-side package for multimodal data loading, decoding, and visualization.

## Layer Contracts

### Queries

Queries fetch small server-authored protobuf artifacts, such as scene inventory
and playback plans. Query code lives under `src/client/queries`, with React
wrappers under `src/client/hooks`.

Queries do not read media bytes or decode payloads. They stay cheap, typed, and
source-agnostic.

### Resources

Resources do the heavier local work needed once the app knows what to play.
They cover byte-range reads, decode execution, and bounded cache contracts
under `src/client/resources`.

Resources are still source-agnostic: a byte range is just `{ source, range }`,
and a decode request is just `{ payload, bytes, context }`. Adapters decide
which ranges to read and which payload descriptors to decode.

### Adapters

Adapters compose queries and resources for a concrete source format. The MCAP
adapter under `src/mcap` owns MCAP indexing, chunk decompression,
channel/schema mapping, sync-window selection, worker playback, and
adapter-owned decoder registration. Its public surface presents playback-ready
APIs instead of exposing MCAP internals to the generic client package.

### Supporting Contracts

`src/decoders` defines generic payload decoder interfaces. `src/visualization`
renders decoded visual outputs without knowing how the bytes were fetched.
`src/schemas/v1` is the shared generated protobuf contract surface.

## Runtime Flow

1. UI hooks fetch inventory/playback-plan contracts through the query layer.
2. The MCAP adapter uses those contracts to choose topics, the active timeline
   range, sync policy, and byte ranges.
3. Byte resources read MCAP ranges through app media URLs and populate the raw
   byte cache.
4. The MCAP reader uses `@mcap/core` with local decompression handlers backed
   by Foxglove's browser WASM codec packages for supported compressed chunks.
5. MCAP messages are mapped to generic payload descriptors and decoded through
   the decode resource client.
6. Decoded visualization outputs are cached and rendered by source-agnostic
   panels.

## Worker Playback

Playback uses `src/mcap/worker` so MCAP scans, decompression, and payload
decoding do not block the main UI thread. The worker owns the same MCAP
resource client as inline execution, but exposes it through prioritized RPC:

-   current-frame requests run before speculative playback batches,
-   streaming reads return incremental values to the main thread,
-   transferable buffers move decoded image/point-cloud data without extra
    copies, and
-   worker startup can fall back to inline execution when configured.

## Decompression

The adapter delegates MCAP chunk decompression to Foxglove's browser WASM codec
packages instead of instantiating `.wasm` binaries directly. The app keeps only
a small local wrapper that:

-   exposes the chunk compressions this adapter supports today: `lz4` and
    `zstd`,
-   validates MCAP decompressed sizes before they are handed to a codec
    package, and
-   leaves codec runtime details, WASM loading, and Emscripten glue inside
    upstream packages.

The FiftyOne app Vite config enables `vite-plugin-wasm`, resolves the Foxglove
package-local WASM imports as asset URLs, and teaches dependency optimization
to keep those wrappers as browser-loadable CommonJS modules. The adapter
installs a small `Buffer` shim before the codec packages load because those
upstream wrappers return Node-style `Buffer` instances.

## Caching

The package has two in-memory cache tiers:

-   The byte cache stores raw byte-range results by source identity and
    half-open range. Remote/object-storage sources use larger fill blocks than
    local sources to reduce round trips.
-   The decoded-output cache stores decoder results by decoder identity,
    payload descriptor, source/record identity, timestamp, and decoder options.

The caches are intentionally app-local and bounded by estimated byte budgets.
They avoid re-reading MCAP chunks and re-decoding repeated playback windows
without changing server-side dataset state.

## Local Manual Test

Create a temporary MCAP dataset from the NuScenes scene file:

```python
import fiftyone as fo

dataset = fo.Dataset("mcap-nuscenes-scene-0002")
dataset.add_sample(
    fo.Sample(filepath="nuscenes/NuScenes-v1.0-trainval-scene-0002.mcap")
)
```

Then compute and persist the scene inventory:

```python
from fiftyone.multimodal.adapters.mcap import McapAdapter
from fiftyone.multimodal.db.mongo import MongoAdapter

inventory = McapAdapter.get_scene_inventory(dataset.first().filepath)
MongoAdapter.write_scene_inventories(dataset, [inventory])
```

Start the app against that dataset. The modal renderer should show synchronized
playback for the hardcoded NuScenes camera/lidar topics.
