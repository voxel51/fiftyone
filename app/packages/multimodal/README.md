# `@fiftyone/multimodal`

App-side infrastructure for loading, decoding, synchronizing, and visualizing
multimodal episode data. It supports multiple source formats while keeping
playback and React surfaces format-neutral.

## Architecture

Dependencies point inward toward stable data contracts:

`composition → views/runtime → ports → IR`

Adapters also implement ports, but views and runtime cannot import them. The
rules in `.dependency-cruiser.cjs` enforce this direction, keep enterprise
wiring behind a single injection seam, and preserve the internal layering of
the MCAP adapter.

- `src/ir` contains cloneable frame, stream, manifest, visualization, and time
  values. It is a dependency leaf.
- `src/ports` defines method-bearing source, resource, and `EpisodeSession`
  contracts using only IR types.
- `src/query` owns source-agnostic byte-range and decode resources, including
  cancellation, priority lanes, and bounded caches.
- `src/adapters` maps concrete formats into the shared contracts. MCAP owns
  indexing, decompression, schemas, workers, and decoder registration; adapters
  never own React UI or shared playback policy.
- `src/runtime` owns demand, synchronization, transport, fallback, and
  adapter-registry policy.
- `src/inject` and explicit acquisition surfaces choose and lazily load an
  adapter. This is the only layer allowed to connect format code to views.

The fixture adapter is the deterministic contract and performance test source.
The LeRobot adapter verifies that the port also supports Parquet/MP4 episodes
without leaking MCAP-style topics or message-log concepts into shared code.

## Episode views

The production React shell lives in `src/views/episode`. Its files are grouped
by product domain: grid, image, inventory, layout, logs, map, playback, plots,
raw data, scene, settings, shared primitives, shell composition, and tiles. See
the [episode domain guide](src/views/episode/README.md) for ownership and
placement rules.

Within this package, `views` means the application layer: product workflow and
composition, not every React component. Reusable rendering and direct
manipulation stay in `visualization`.

Visualization is organized by semantic output: image, 3D scene, map, plot,
message, and logs, with shared interaction and WebGPU infrastructure alongside.
Build-time extensions may contribute timeline sections or namespaced tiles
through narrow public contracts.

Production consumers outside the directory import only its root `index.ts`.
Code inside an episode domain imports canonical files directly; it must not
import the root entrypoint or introduce domain barrels. These constraints keep
public dependencies stable while allowing internal files to move safely.

## Runtime flow

1. Composition identifies the source and lazily loads its adapter.
2. Shared byte resources acquire source assets and populate bounded caches.
3. The adapter returns a neutral manifest and pull-based `EpisodeSession`.
4. Runtime policy requests time windows, using optional accelerated
   capabilities only when they preserve shared fallback semantics.
5. Adapters map records into `DecodedFrame` values and cloneable visualization
   outputs.
6. Episode contexts deliver those values to modal, grid, timeline, and tile
   consumers.

MCAP scanning, chunk decompression, and decoding run in
`src/adapters/mcap/worker`. Prioritized RPC lets current-frame work preempt
speculative batches, streams incremental results, and transfers media buffers
without unnecessary copies. Caching is split between source-neutral byte
blocks, MCAP reader/index state, and playback-window policy.

## Development

From `app/`, run:

```shell
yarn workspace @fiftyone/multimodal check
yarn vitest run packages/multimodal/src --no-coverage
```

The check covers lint, TypeScript, and dependency-cruiser architecture rules.
