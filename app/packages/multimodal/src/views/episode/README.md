# Episode view domains

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

## Camera ownership

- `grid/` owns lightweight preview selection and preview-camera state.
- `spatial/camera-geometry/` owns calibration, projection, rectification, and
  ray math shared by image and scene rendering.
- `spatial/frame-transforms/` owns the shared transform resolver and graph.
- `scene/camera/` owns the 3D camera rig, viewpoints, tracking, and navigation.
- `scene/placement/` adapts frame-transform resolutions into scene objects.
- `shell/` owns composition that coordinates more than one camera surface.
