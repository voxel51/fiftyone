# Episode view domains

The episode view is organized by product domain. Keep rendering, state, hooks,
styles, and tests beside the product surface they implement. The root is a
package-internal boundary and contains only this guide and `index.ts`.

| Directory    | Responsibility                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `grid/`      | Grid renderer, preview-camera state, and per-dataset stream selection                              |
| `image/`     | Image tiles, annotations, projection, depth hover, rectification, and video decode runways         |
| `inventory/` | Format-neutral stream discovery, classification, filtering, and session inventory                  |
| `layout/`    | Modal mosaic persistence and automatic playback layout                                             |
| `logs/`      | Log console tile, row projection, windowing, and tile state                                        |
| `map/`       | Map tile, basemap, viewport, route, location tracks, puck, and WGS84 helpers                       |
| `playback/`  | Live stream delivery, caching, buffering, synchronization, time, health, and registration          |
| `plots/`     | Plot tile, numeric-series context and joins, and plot-field actions                                |
| `raw/`       | Raw-message tile, tree, context, selection state, and raw-tile actions                             |
| `scene/`     | 3D tile and camera rig, transforms, scene updates, pose trajectories, point hover, and inspector   |
| `settings/`  | Modal settings state, settings sidebar, generic controls, keyboard behavior, and stream settings   |
| `shared/`    | Small, genuinely domain-neutral health and notice primitives                                       |
| `shell/`     | Modal and source composition plus status UI that coordinates multiple domains                      |
| `tiles/`     | Tile registry, definitions, settings registration, visibility, shared tile styles, and add-tile UI |

## Placement rules

1. Put a file with the product surface it primarily implements, not with the
   component that happens to import it.
2. Keep tests and CSS modules in the same directory as their subjects.
3. Put multi-domain composition in `shell/`.
4. Put static stream and scene-source discovery in `inventory/`. Put live,
   playhead-relative delivery and status in `playback/`.
5. Put tile framework code in `tiles/`; individual tile implementations stay in
   their feature domains.
6. Use `shared/` only for domain-neutral primitives. It is not a miscellaneous
   directory.
7. Do not add TypeScript, test, or style files directly under `episode/`.
   `README.md` and `index.ts` are the only root files.
8. Do not add domain barrel files. Direct cross-domain imports make ownership
   and dependency direction visible.
9. Code below a domain directory must not import the root `index.ts`. That
   entrypoint is only for production callers outside `views/episode`.

## Camera ownership

- `grid/` owns lightweight preview selection and preview-camera state.
- `image/camera-geometry/` owns calibration, projection, rectification, and ray
  math used by image rendering.
- `scene/` owns the 3D camera rig, viewpoints, tracking, and camera interaction
  in the 3D scene.
- `shell/` owns composition that coordinates more than one camera surface.

## Known pressure point

`scene/` is intentionally oversized. This first reorganization keeps the move
mechanical; follow-up splits should consider `camera-rig/`, `transforms/`,
`inspector/`, and `hover/`.
