# `@fiftyone/multimodal`

App-side infrastructure for loading, decoding, synchronizing, and visualizing
multimodal episode data. It supports multiple source formats while keeping
playback and React surfaces format-neutral.

## Episode views

The production React shell lives in `src/views/episode`. Its files are grouped
by product domain: grid, image, interaction, layout, logs, map, playback,
plots, raw data, scene, settings, shell composition, spatial capabilities,
status, stream discovery, and tiles. See the
[episode domain guide](src/views/episode/README.md) for ownership and placement
rules.

Within this package, `views` means the application layer: product workflow and
composition. Reusable rendering and direct manipulation stay in
`visualization`.

Visualization is organized by semantic output: 2D media, 3D scene, map, plot,
message, and logs. Shared interaction and WebGPU are foundations; cross-family
rendering lives in an explicit composition domain. Extensions contribute
timeline sections or namespaced tiles through narrow contracts.

## Naming

- Component-primary files use PascalCase and match their main component.
- Hooks, state, controllers, and pure logic use kebab-case.

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

## Bounded aggregate reads

Playback windows continue to use the pull-based `EpisodeSession.read()` path.
Any feature that may inspect a manifest-wide or otherwise source-sized region
must instead use `session.boundedRead` when the adapter exposes it:

1. Open the source account once. Calling `openAccount()` without an argument
   selects the adapter's fixed finite source allowance; supplying another
   allowance is an explicit product-policy decision.
2. Create one job per independently resumable feature.
3. Request one mandatory finite grant and render only the returned coverage.
4. Store the opaque continuation and resume only after an explicit feature
   decision. Never drain it automatically.
5. Treat `budget-exhausted` and `oversized-source-unit` as partial outcomes,
   not as permission to fall back to `session.read()`.

All jobs and speculative byte-cache warming share the same source account.
Warm-cache hits therefore consume logical source bytes even when transferred
bytes are zero. A source or content-validator change creates a new session and
invalidates old jobs and continuations.

Cancellation aborts an in-flight range request and suppresses result delivery.
The MCAP worker yields after each synchronous, precharged chunk and at bounded
decode intervals so it can observe cancellation before starting more source
work. A cancelled grant returns no continuation, retains its conservative
reservation, and records best-effort usage for work completed before the
cancellation boundary.

## Development

From `app/`, run:

```shell
yarn workspace @fiftyone/multimodal check
yarn vitest run packages/multimodal/src --no-coverage
```

The check covers lint, TypeScript, and dependency-cruiser architecture rules.
