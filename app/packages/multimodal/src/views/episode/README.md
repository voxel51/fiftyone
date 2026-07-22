# Episode view domains

The episode view is organized by product domain. Keep rendering, state, hooks,
styles, and tests beside the product surface they implement. The root is a
package-internal boundary and contains only this guide and `index.ts`.

| Directory           | Responsibility                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------- |
| `grid/`             | Grid renderer, preview playback, preview-camera state, and per-dataset stream selection     |
| `image/`            | Image tiles, annotations, projection overlays, and depth-hover surface adapters             |
| `interaction/`      | Surface-neutral selection, point-hover payloads, and runtime registries                     |
| `layout/`           | Modal mosaic persistence and automatic playback layout                                      |
| `logs/`             | Log console tile, row projection, windowing, and tile state                                 |
| `map/`              | Episode-owned map tile, rendering, tracks, viewport, basemap, and measurement policy        |
| `playback/`         | Live delivery, buffering, cache policy, synchronization, time, and video decode runways     |
| `plots/`            | Plot tile, numeric-series context and joins, and plot-field actions                         |
| `presentation/`     | Cross-surface presentation policy that contains no feature composition                      |
| `raw/`              | Raw-message tile, tree, context, selection state, and raw-tile actions                      |
| `scene/`            | 3D capabilities split into `camera`, `entities`, `picking`, `placement`, and `tile`         |
| `settings/`         | Reusable controls under `controls` and modal settings state/composition under `modal`       |
| `shell/`            | Product composition, tile catalog/registration, modal hosting, and source orchestration     |
| `spatial/`          | Camera geometry, frame transforms, depth projection, and shared view preferences            |
| `status/`           | Health, notices, performance reporting, and error presentation                              |
| `stream-discovery/` | Format-neutral stream discovery, classification, filtering, and session inventory           |
| `tiles/`            | Lower tile contracts, source bindings, open commands, settings registration, and visibility |

## Placement rules

1. Put a file with the product surface it primarily implements, not with the
   component that happens to import it.
2. Keep tests and CSS modules in the same directory as their subjects.
3. Put multi-domain composition in `shell/`.
4. Put static stream and scene-source discovery in `stream-discovery/`. Put
   live, playhead-relative delivery and status in `playback/`.
5. Put tile framework code in `tiles/`; individual tile implementations stay in
   their feature domains, while catalog composition stays in `shell/`.
6. Put reusable geometry and linked interaction values in their named
   `spatial/` or `interaction/` capability. Neither may import a feature tile.
7. Do not add TypeScript, test, or style files directly under `episode/`.
   `README.md` and `index.ts` are the only root files.
8. Do not add domain barrel files. Direct cross-domain imports make ownership
   and dependency direction visible.
9. Code below a domain directory must not import the root `index.ts`. That
   entrypoint is only for production callers outside `views/episode`.
10. Follow the package naming policy; the enclosing `episode/` directory
    supplies the domain context for private filenames and symbols.

## Camera ownership

- `grid/` owns lightweight preview selection and preview-camera state.
- `spatial/camera-geometry/` owns calibration, projection, rectification, and
  ray math shared by image and scene rendering.
- `spatial/frame-transforms/` owns the shared transform resolver and graph.
- `scene/camera/` owns the 3D camera rig, viewpoints, tracking, and navigation.
- `scene/placement/` adapts frame-transform resolutions into scene objects.
- `shell/` owns composition that coordinates more than one camera surface.
