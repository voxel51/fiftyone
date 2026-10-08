import { getCategoryForPanel, getCategoryLabel } from "@fiftyone/plugins";
import { PanelRenderer, usePanels } from "@fiftyone/spaces";
import { panelsCompareFn } from "@fiftyone/spaces/src/utils/sort";
import {
  useSetTileTitle,
  useTileId,
  type RegisteredTile,
  type TilingTile,
} from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import {
  useCallback,
  useEffect,
  useMemo,
  type ComponentType,
  type CSSProperties,
} from "react";

/**
 * Plugin panels as a tile kind. One registered kind per panel that declares
 * the `"modal"` surface, typed `panel:<pluginName>`, so split, change-type
 * and layout restore all go through the registry like built-in kinds.
 */

export const PANEL_TILE_TYPE_PREFIX = "panel:";

/** The sample-view surface value the plugin contract already uses. */
export const PANEL_TILE_SCOPE = "modal";

export function panelTileType(panelName: string): string {
  return `${PANEL_TILE_TYPE_PREFIX}${panelName}`;
}

export function isPanelTileType(type: string): boolean {
  return type.startsWith(PANEL_TILE_TYPE_PREFIX);
}

export function panelNameFromTileType(type: string): string | null {
  return isPanelTileType(type)
    ? type.slice(PANEL_TILE_TYPE_PREFIX.length)
    : null;
}

/** Panel registrations offered on the sample view, in display order. */
export type ModalPanelRegistration = ReturnType<typeof usePanels>[number];

/** The plugin registry's category ids, as `getCategoryLabel` accepts them. */
export type PanelCategory = Parameters<typeof getCategoryLabel>[0];

const isModalPanel = (panel: ModalPanelRegistration): boolean =>
  !!panel.panelOptions?.surfaces?.includes(PANEL_TILE_SCOPE);

/** Plugin panels available as tiles for the current dataset. */
export function useModalPanelRegistrations(): ModalPanelRegistration[] {
  const panels = usePanels(isModalPanel);
  return useMemo(() => [...panels].sort(panelsCompareFn), [panels]);
}

/** Panel category in the grid "+" menu's order. */
export function panelCategory(panel: ModalPanelRegistration): PanelCategory {
  return getCategoryForPanel(panel) as PanelCategory;
}

export const PANEL_CATEGORY_ORDER: readonly PanelCategory[] = [
  "import",
  "curate",
  "analyze",
  "custom",
];

/**
 * Renders a plugin panel inside a tile: a synthetic Spaces node whose id is
 * the tile id, on the sample-view scope, with the panel's own dimensions,
 * Suspense and skeleton handled by the Spaces panel renderer.
 */
const PluginPanelTile = ({ panelName }: { panelName: string }) => {
  const tileId = useTileId();
  const setTileTitle = useSetTileTitle();
  const panels = useModalPanelRegistrations();
  const label = panels.find((panel) => panel.name === panelName)?.label;

  // Plugins register after mount, so the label a restored layout started
  // with (the plugin name) is replaced once the registration shows up.
  useEffect(() => {
    if (label) setTileTitle(label, { source: "auto" });
  }, [label, setTileTitle]);

  if (!tileId) return null;
  return (
    <PanelRenderer name={panelName} id={tileId} scope={PANEL_TILE_SCOPE} />
  );
};

const tileComponents = new Map<string, ComponentType>();

/** One stable component per panel so the registry entry is referentially stable. */
function tileComponentFor(panelName: string): ComponentType {
  let Tile = tileComponents.get(panelName);
  if (!Tile) {
    Tile = () => <PluginPanelTile panelName={panelName} />;
    Tile.displayName = `PluginPanelTile(${panelName})`;
    tileComponents.set(panelName, Tile);
  }
  return Tile;
}

/** Materialize a panel tile entry; `label` falls back to the plugin name. */
export function createPanelTile(panelName: string, label?: string): TilingTile {
  const Tile = tileComponentFor(panelName);
  return {
    type: panelTileType(panelName),
    title: label ?? panelName,
    render: () => <Tile />,
  };
}

type IconComponent = ComponentType<{ style?: CSSProperties }>;

/** A renderable element type, unwrapping CJS/ESM default-export residue. */
function toRenderableIcon(icon: unknown): IconComponent | undefined {
  if (typeof icon === "function") return icon as IconComponent;
  if (icon && typeof icon === "object") {
    if ((icon as { $$typeof?: symbol }).$$typeof) {
      return icon as unknown as IconComponent;
    }
    const inner = (icon as { default?: unknown }).default;
    if (inner) return toRenderableIcon(inner);
  }
  return undefined;
}

/** The panel's registered icon at menu size, or the generic plugin glyph. */
export function panelTileIcon(
  panel: ModalPanelRegistration,
): RegisteredTile["icon"] {
  const PanelIcon = toRenderableIcon(panel.Icon);
  if (!PanelIcon) return IconName.Puzzle;
  return <PanelIcon style={{ width: 16, height: 16 }} />;
}

/** Registry entries for every panel available on the sample view. */
export function useRegisteredPanelTiles(): RegisteredTile[] {
  const panels = useModalPanelRegistrations();
  return useMemo(
    () =>
      panels.map((panel) => ({
        type: panelTileType(panel.name),
        typeLabel: panel.label ?? panel.name,
        icon: panelTileIcon(panel),
        Tile: tileComponentFor(panel.name),
      })),
    [panels],
  );
}

/** Panels that may appear only once on the canvas (`allowDuplicates` unset). */
export function useSingletonPanelTileTypes(): Set<string> {
  const panels = useModalPanelRegistrations();
  return useMemo(
    () =>
      new Set(
        panels
          .filter((panel) => panel.panelOptions?.allowDuplicates !== true)
          .map((panel) => panelTileType(panel.name)),
      ),
    [panels],
  );
}

/** Whether a panel kind may be added given what is already on the canvas. */
export function useCanAddPanelTile(): (
  panel: ModalPanelRegistration,
  presentTypes: ReadonlySet<string | undefined>,
) => boolean {
  return useCallback(
    (panel, presentTypes) =>
      panel.panelOptions?.allowDuplicates === true ||
      !presentTypes.has(panelTileType(panel.name)),
    [],
  );
}
