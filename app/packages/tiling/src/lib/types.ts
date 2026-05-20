import type { ComponentType, ReactNode } from "react";
import type { MosaicNode } from "react-mosaic-component";

/**
 * One entry in the tile registry — links a data source (e.g. a
 * playback stream) to the tile component that should render it.
 *
 * Tiling is the owner here, not the data layer: the playback engine
 * (or any other source) calls `registerTile(...)` with this shape
 * whenever a source becomes available for spawning into a tile.
 *
 * The same `type` may be registered for multiple sources (e.g. several
 * camera streams). UIs that show "what kinds of tiles can I add" should
 * use `useTileTypes()` (deduplicated by `type`); UIs that show "which
 * source feeds this tile" should use `useTileSourcesByType(type)`.
 */
export interface RegisteredTile {
  /** Id of the source this tile renders — typically a playback stream id. */
  streamId: string;
  /** Discriminator used to group sources of the same kind. */
  type: string;
  /** Menu label for the type, shared across every source of this `type`. */
  typeLabel: string;
  /** Per-source display name (used in the settings source picker). */
  title: string;
  /** Menu / chrome icon. Opaque to tiling — passed straight through to voodo. */
  icon: unknown;
  /** Tile body component, mounted as `<Tile />` when a new tile spawns. */
  Tile: ComponentType;
}

/**
 * Per-tile config the tiling layer renders. `title` shows in the
 * draggable toolbar; `render` returns the body content.
 */
export interface TilingTile {
  title: string;
  render: () => ReactNode;
}

export interface AddTileOptions {
  /**
   * Prefix used when generating the new tile's id. Defaults to `"tile"`.
   * The provider keeps a single counter; final id is `${prefix}-${n}`.
   */
  idPrefix?: string;
  /**
   * Tile id to split when inserting the new tile. Defaults to the
   * currently focused tile (if any). Falls back to splitting the
   * largest leaf when the target isn't in the layout.
   */
  targetId?: string | null;
  /**
   * Whether to focus the new tile after inserting it. Defaults to `true`.
   */
  focus?: boolean;
}

/** Everything the `TilingProvider` context exposes. */
export interface TilingContextValue {
  // Layout state
  layout: MosaicNode<string> | null;
  tiles: Record<string, TilingTile>;
  focusedTileId: string | null;

  // Layout setters / operations
  setLayout: (layout: MosaicNode<string> | null) => void;
  setFocusedTileId: (id: string | null) => void;
  addTile: (tile: TilingTile, options?: AddTileOptions) => string;
  removeTile: (id: string) => void;
  autoLayout: () => void;

  // Settings registry
  FocusedTileSettings: ComponentType | null;
  registerSettings: (
    tileId: string,
    Component: ComponentType
  ) => () => void;
}
