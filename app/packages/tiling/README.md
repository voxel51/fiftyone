# @fiftyone/tiling

Generic, draggable tile grid + sidebars. Data-source-agnostic — the playback
engine plugs in via the tile registry, but anything that can call
`registerTile(...)` works.

## Layout

```text
src/
  lib/              # state + hooks
    TilingProvider  # mounts context + handles layout state
    atoms           # registry / source / selection atoms
    use-tile-state  # useTileSource, useTileSelection, useTileTypes, …
    use-tile-registry  # registerTile API for data layers
    use-registered-tiles
    types

  views/            # chrome (each gets its own stories + tests)
    MosaicGrid              # draggable / resizable layout
    Tile                    # standalone chrome (header + body)
    TilingHeader            # filename + add-tile + sidebar toggles
    SidebarPanel            # title + divider + body shell
    TileSettingsSidebar     # renders the focused tile's settings
    TilingInspectorSidebar  # renders the focused tile's selection
```

Stories surface under **Tiling/Components/** in Storybook.
