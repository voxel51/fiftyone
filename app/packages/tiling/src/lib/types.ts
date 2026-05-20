import type { IconName } from "@voxel51/voodo";
import type { ComponentType, ReactNode } from "react";
import type { MosaicNode } from "react-mosaic-component";

/**
 * One entry in the tile registry — a renderable tile kind that the
 * "Add tile" menu can spawn. Keyed by `type`; registering the same
 * `type` again replaces the entry. The tile knows nothing about its
 * data — picking a topic / stream / dataset is the tile's own
 * concern, not tiling's.
 */
export interface RegisteredTile {
  /** Stable key. One entry per `type`; the menu shows one item per type. */
  type: string;
  /** Menu label for the type. */
  typeLabel: string;
  /** Menu / chrome icon. Passed straight to voodo's `<MenuIconTextItem>`. */
  icon: IconName | ReactNode;
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

  /**
   * Portal target for the focused tile's settings UI. `TileSettingsSidebar`
   * writes the slot element via `setSettingsSlotEl`; tile bodies render
   * `<TileSettingsContent>` whose children portal into this element
   * when the surrounding tile is focused.
   */
  settingsSlotEl: HTMLElement | null;
  setSettingsSlotEl: (el: HTMLElement | null) => void;

  /**
   * Per-tile title overrides. A tile body calls `useSetTileTitle(...)`
   * when its content makes the static `MosaicTileConfig.title` stale —
   * for example, when the user picks a different source in settings.
   * Header consumers (the tile chrome + the settings sidebar header)
   * read the override and fall back to the static title when absent.
   */
  titleOverrides: Record<string, string>;
  setTileTitleOverride: (tileId: string, title: string | null) => void;
}
