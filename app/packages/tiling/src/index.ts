// Public surface for `@fiftyone/tiling`.

// --- Tiling layout state ---------------------------------------------------
export {
  TilingProvider,
  TileIdScope,
  useTiling,
  useTileId,
  useTileSettings,
} from "./lib/TilingProvider";
export type { TilingProviderProps } from "./lib/TilingProvider";
export type {
  TilingTile,
  AddTileOptions,
  TilingContextValue,
  RegisteredTile,
} from "./lib/types";

// --- Per-tile state -------------------------------------------------------
export {
  registeredTilesAtom,
  tileSourceAtom,
  tileSelectionAtom,
} from "./lib/atoms";
export {
  useTileSource,
  useSetTileSource,
  useSetTileSourceFor,
  useTileSelection,
  useSetTileSelection,
  useTileSelectionFor,
  useTileTypes,
  useTileSourcesByType,
} from "./lib/use-tile-state";
export { useRegisteredTiles } from "./lib/use-registered-tiles";
export { useTileRegistry } from "./lib/use-tile-registry";

// --- View components -------------------------------------------------------
export { default as MosaicGrid } from "./views/MosaicGrid/MosaicGrid";
export type {
  MosaicTileConfig,
  MosaicGridProps,
} from "./views/MosaicGrid/MosaicGrid";
export {
  addTileToLayout,
  autoLayout,
  collectTileIds,
} from "./views/MosaicGrid/MosaicGrid";

export { default as Tile, TileHeader } from "./views/Tile/Tile";
export type { TileProps, TileHeaderProps } from "./views/Tile/Tile";

export { default as TilingHeader } from "./views/TilingHeader/TilingHeader";
export type { TilingHeaderProps } from "./views/TilingHeader/TilingHeader";

export { default as SidebarPanel } from "./views/SidebarPanel/SidebarPanel";
export type { SidebarPanelProps } from "./views/SidebarPanel/SidebarPanel";

export { default as TileSettingsSidebar } from "./views/TileSettingsSidebar/TileSettingsSidebar";
export { default as TilingInspectorSidebar } from "./views/TilingInspectorSidebar/TilingInspectorSidebar";
