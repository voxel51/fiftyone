import type { IconName } from "@voxel51/voodo";
import type { ComponentType, ReactNode } from "react";
import type { MosaicNode } from "react-mosaic-component";

/**
 * A renderable tile kind for the "Add tile" menu. Keyed by `type` —
 * registering the same `type` replaces the entry.
 */
export interface RegisteredTile {
  type: string;
  typeLabel: string;
  icon: IconName | ReactNode;
  Tile: ComponentType;
}

/**
 * Per-tile config the tiling layer renders. `title` shows in the
 * draggable toolbar; `render` returns the body content.
 */
export interface TilingTile {
  /**
   * Registered tile kind. Kept on the tile entry itself so duplicate,
   * split, and type-change operations don't have to infer behavior from
   * generated ids.
   */
  type?: string;
  title: string;
  render: () => ReactNode;
}

/** Measured mosaic geometry available to host-specific layout strategies. */
export interface TilingLayoutMetrics {
  readonly width: number;
  readonly height: number;
  /** Fixed horizontal space each leaf loses to margins, borders, and chrome. */
  readonly tileHorizontalInset: number;
  /** Fixed vertical space each leaf loses to margins, borders, and its toolbar. */
  readonly tileVerticalInset: number;
}

export type TilingAutoLayoutStrategy = (
  tileIds: readonly string[],
  metrics?: TilingLayoutMetrics,
) => MosaicNode<string> | null;

export type TileTitleSource = "auto" | "manual";

export interface SetTileTitleOptions {
  /**
   * `manual` titles are user-authored and block later heuristic updates.
   * `auto` titles are best-effort labels derived from tile bindings.
   */
  source?: TileTitleSource;
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
  /**
   * Split direction for the insert: `"row"` places the new tile to the
   * right of the target, `"column"` below it. Defaults to splitting the
   * target's longer axis so sub-tiles stay roughly square.
   */
  direction?: "row" | "column";
}

/** Everything the `TilingProvider` context exposes. */
export interface TilingContextValue {
  // Layout state
  layout: MosaicNode<string> | null;
  tiles: Record<string, TilingTile>;
  focusedTileId: string | null;
  expandedTileId: string | null;

  // Layout setters / operations
  setLayout: (layout: MosaicNode<string> | null) => void;
  setFocusedTileId: (id: string | null) => void;
  setExpandedTileId: (id: string | null) => void;
  addTile: (tile: TilingTile, options?: AddTileOptions) => string;
  removeTile: (id: string) => void;
  autoLayout: () => void;
  /** Restore the host-defined default tiles and layout. */
  resetLayout: () => void;
  /** Report current mosaic geometry without triggering provider renders. */
  setLayoutMetrics: (metrics: TilingLayoutMetrics | null) => void;
  /**
   * Spawn a fresh tile of the same kind beside `tileId` — `"row"` puts
   * it to the right, `"column"` below. The kind comes from the tile's
   * `type` metadata and the registry; unregistered kinds fall back to
   * the tile's duplicate factory. Returns the new tile's id, or
   * `null` when neither can produce one.
   */
  splitTile: (tileId: string, direction: "row" | "column") => string | null;
  /**
   * Clone `tileId` next to itself. Uses the factory the tile body
   * registered via `useTileDuplicator` (an exact clone including
   * bindings); falls back to a fresh same-kind instance from the
   * registry. Returns the new tile's id, or `null`.
   */
  duplicateTile: (tileId: string) => string | null;
  /**
   * Replace `tileId` with a fresh tile of another registered kind,
   * preserving the leaf's position in the mosaic layout.
   */
  changeTileType: (tileId: string, type: string) => string | null;
  /** Close every tile except `tileId` and focus the survivor. */
  closeOtherTiles: (tileId: string) => void;
  /**
   * Register a factory that produces an exact clone of the tile —
   * called by `duplicateTile`. Returns an unregister function. Prefer
   * the `useTileDuplicator` hook inside tile bodies.
   */
  registerTileDuplicator: (
    tileId: string,
    factory: () => TilingTile,
  ) => () => void;

  // Portal target for the focused tile's settings UI.
  settingsSlotEl: HTMLElement | null;
  setSettingsSlotEl: (el: HTMLElement | null) => void;

  /** User-authored titles, keyed by tile id. */
  manualTileTitles: Readonly<Record<string, string>>;
  /** Update the title of an existing tile by id. */
  setTileTitle: (
    tileId: string,
    title: string,
    options?: SetTileTitleOptions,
  ) => void;
}
