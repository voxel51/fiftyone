import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";

export const MCAP_MAP_BASE_LAYER = {
  DEFAULT: "default",
  NONE: "none",
} as const;

export type McapMapBaseLayer =
  (typeof MCAP_MAP_BASE_LAYER)[keyof typeof MCAP_MAP_BASE_LAYER];

export const OPENFREEMAP_LIBERTY_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

export interface McapMapTileSettings {
  /**
   * Basemap selection for the geographic view. The default is an OSS
   * OpenFreeMap style; `none` is the explicit offline/no-tile mode.
   */
  readonly baseLayer: McapMapBaseLayer;
  /**
   * `undefined` means "all location topics currently present". Once the
   * user edits topic visibility, this becomes the explicit visible list.
   */
  readonly enabledTopics?: readonly string[];
  /** Follow the playhead marker until the user manually pans/zooms. */
  readonly followEgo: boolean;
}

export type McapMapTileSettingsByTile = Readonly<
  Record<string, McapMapTileSettings>
>;

export const DEFAULT_MCAP_MAP_TILE_SETTINGS: McapMapTileSettings = {
  baseLayer: MCAP_MAP_BASE_LAYER.DEFAULT,
  followEgo: true,
};

export const mcapMapTileSettingsAtom = atom<McapMapTileSettingsByTile>({});

export function useMcapMapTileSettings(): McapMapTileSettings {
  const tileId = useTileId();
  const byTile = useAtomValue(mcapMapTileSettingsAtom);
  return useMemo(
    () =>
      tileId
        ? { ...DEFAULT_MCAP_MAP_TILE_SETTINGS, ...byTile[tileId] }
        : DEFAULT_MCAP_MAP_TILE_SETTINGS,
    [byTile, tileId],
  );
}

export function useSetMcapMapTileSettings(): (
  patch: Partial<McapMapTileSettings>,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (patch) => {
      if (!tileId) return;
      store.set(mcapMapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_MCAP_MAP_TILE_SETTINGS,
          ...previous[tileId],
        };
        const next = { ...current, ...patch };
        if (
          next.baseLayer === current.baseLayer &&
          next.enabledTopics === current.enabledTopics &&
          next.followEgo === current.followEgo
        ) {
          return previous;
        }
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}

export function useToggleMcapMapTileTopic(): (
  topic: string,
  enabled: boolean,
  allTopics: readonly string[],
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (topic, enabled, allTopics) => {
      if (!tileId) return;
      store.set(mcapMapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_MCAP_MAP_TILE_SETTINGS,
          ...previous[tileId],
        };
        const enabledTopics = new Set(current.enabledTopics ?? allTopics);
        if (enabled) {
          enabledTopics.add(topic);
        } else {
          enabledTopics.delete(topic);
        }
        const nextTopics = allTopics.filter((candidate) =>
          enabledTopics.has(candidate),
        );
        const next: McapMapTileSettings = {
          ...current,
          enabledTopics: nextTopics,
        };
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}

export function normalizeMcapMapBaseLayer(
  raw: unknown,
): McapMapBaseLayer | undefined {
  return raw === MCAP_MAP_BASE_LAYER.DEFAULT || raw === MCAP_MAP_BASE_LAYER.NONE
    ? raw
    : undefined;
}
