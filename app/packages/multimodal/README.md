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

## Development

From `app/`, run:

```shell
yarn workspace @fiftyone/multimodal check
yarn vitest run packages/multimodal/src --no-coverage
```

The check covers lint, TypeScript, and dependency-cruiser architecture rules.
