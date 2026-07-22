import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";
import {
  EPISODE_MAP_BASE_LAYER,
  type EpisodeMapBaseLayer,
} from "../rendering/types";

export {
  EPISODE_MAP_BASE_LAYER,
  OPENFREEMAP_LIBERTY_STYLE_URL,
  OPENFREEMAP_PROVIDER_NAME,
  type EpisodeMapBaseLayer,
} from "../rendering/types";

export interface EpisodeMapTileSettings {
  /**
   * Basemap selection for the geographic view. The default is an OSS
   * OpenFreeMap style; `none` is the explicit offline/no-tile mode.
   */
  readonly baseLayer: EpisodeMapBaseLayer;
  /**
   * `undefined` means "all location streams currently present". Once the
   * user edits stream visibility, this becomes the explicit visible list.
   */
  readonly enabledStreams?: readonly string[];
  /** Follow the playhead marker until the user manually pans/zooms. */
  readonly followEgo: boolean;
}

export type EpisodeMapTileSettingsByTile = Readonly<
  Record<string, EpisodeMapTileSettings>
>;

export const DEFAULT_EPISODE_MAP_TILE_SETTINGS: EpisodeMapTileSettings = {
  baseLayer: EPISODE_MAP_BASE_LAYER.DEFAULT,
  followEgo: true,
};

export const episodeMapTileSettingsAtom = atom<EpisodeMapTileSettingsByTile>(
  {},
);

export function useEpisodeMapTileSettings(): EpisodeMapTileSettings {
  const tileId = useTileId();
  const byTile = useAtomValue(episodeMapTileSettingsAtom);
  return useMemo(
    () =>
      tileId
        ? { ...DEFAULT_EPISODE_MAP_TILE_SETTINGS, ...byTile[tileId] }
        : DEFAULT_EPISODE_MAP_TILE_SETTINGS,
    [byTile, tileId],
  );
}

export function useSetEpisodeMapTileSettings(): (
  patch: Partial<EpisodeMapTileSettings>,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (patch) => {
      if (!tileId) return;
      store.set(episodeMapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_EPISODE_MAP_TILE_SETTINGS,
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

export function useToggleEpisodeMapTileStream(): (
  stream: string,
  enabled: boolean,
  allStreams: readonly string[],
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (stream, enabled, allStreams) => {
      if (!tileId) return;
      store.set(episodeMapTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_EPISODE_MAP_TILE_SETTINGS,
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
        const next: EpisodeMapTileSettings = {
          ...current,
          enabledStreams: nextStreams,
        };
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}

export function normalizeEpisodeMapBaseLayer(
  raw: unknown,
): EpisodeMapBaseLayer | undefined {
  return raw === EPISODE_MAP_BASE_LAYER.DEFAULT ||
    raw === EPISODE_MAP_BASE_LAYER.NONE
    ? raw
    : undefined;
}
