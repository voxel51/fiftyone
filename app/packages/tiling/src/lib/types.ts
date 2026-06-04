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

  // Portal target for the focused tile's settings UI.
  settingsSlotEl: HTMLElement | null;
  setSettingsSlotEl: (el: HTMLElement | null) => void;

  /** Update the title of an existing tile by id. */
  setTileTitle: (tileId: string, title: string) => void;
}
