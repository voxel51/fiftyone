import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";
import { MAP_BASE_LAYER, type MapBaseLayer } from "../rendering/types";

export { MAP_BASE_LAYER, type MapBaseLayer } from "../rendering/types";

export interface MapTileSettings {
  /**
   * Basemap selection for the geographic view. The default is an OSS
   * OpenFreeMap style; `none` is the explicit offline/no-tile mode.
   */
  readonly baseLayer: MapBaseLayer;
  /**
   * `undefined` means "all location streams currently present". Once the
   * user edits stream visibility, this becomes the explicit visible list.
   */
  readonly enabledStreams?: readonly string[];
  /** Follow the playhead marker until the user manually pans/zooms. */
  readonly followEgo: boolean;
}

export type MapTileSettingsByTile = Readonly<Record<string, MapTileSettings>>;

export const DEFAULT_MAP_TILE_SETTINGS: MapTileSettings = {
  baseLayer: MAP_BASE_LAYER.DEFAULT,
  followEgo: true,
};

export const mapTileSettingsAtom = atom<MapTileSettingsByTile>({});

export function useMapTileSettings(): MapTileSettings {
  const tileId = useTileId();
  const byTile = useAtomValue(mapTileSettingsAtom);
  return useMemo(
    () =>
      tileId
        ? { ...DEFAULT_MAP_TILE_SETTINGS, ...byTile[tileId] }
        : DEFAULT_MAP_TILE_SETTINGS,
    [byTile, tileId],
  );
}

export function useSetMapTileSettings(): (
  patch: Partial<MapTileSettings>,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (patch) => {
      if (!tileId) return;
      store.set(mapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_MAP_TILE_SETTINGS,
          ...previous[tileId],
        };
        const next = { ...current, ...patch };
        if (
          next.baseLayer === current.baseLayer &&
          next.enabledStreams === current.enabledStreams &&
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

export function useToggleMapTileStream(): (
  stream: string,
  enabled: boolean,
  allStreams: readonly string[],
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (stream, enabled, allStreams) => {
      if (!tileId) return;
      store.set(mapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_MAP_TILE_SETTINGS,
          ...previous[tileId],
        };
        const enabledStreams = new Set(current.enabledStreams ?? allStreams);
        if (enabled) {
          enabledStreams.add(stream);
        } else {
          enabledStreams.delete(stream);
        }
        const nextStreams = allStreams.filter((candidate) =>
          enabledStreams.has(candidate),
        );
        const next: MapTileSettings = {
          ...current,
          enabledStreams: nextStreams,
        };
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}

export function normalizeMapBaseLayer(raw: unknown): MapBaseLayer | undefined {
  return raw === MAP_BASE_LAYER.DEFAULT || raw === MAP_BASE_LAYER.NONE
    ? raw
    : undefined;
}
