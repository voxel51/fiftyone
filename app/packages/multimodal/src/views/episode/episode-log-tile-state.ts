import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";
import { LOG_LEVELS, type LogLevel } from "../../ir";

/**
 * View configuration for one log console tile. This is the log tile's
 * settings-shaped state — what to show and how to follow — as opposed to
 * the moment's state (window center, fetched rows), which stays ephemeral
 * component state.
 */
export interface EpisodeLogTileSettings {
  /**
   * `undefined` means "all log streams currently present". Once the user
   * edits stream visibility, this becomes the explicit visible list.
   */
  readonly enabledStreams?: readonly string[];
  /** Keep the visible window following the playhead. */
  readonly followPlayhead: boolean;
  readonly selectedLevels: readonly LogLevel[];
}

export type EpisodeLogTileSettingsByTile = Readonly<
  Record<string, EpisodeLogTileSettings>
>;

export const DEFAULT_EPISODE_LOG_TILE_SETTINGS: EpisodeLogTileSettings = {
  followPlayhead: true,
  selectedLevels: LOG_LEVELS,
};

/**
 * Per-tile log view settings, stored in the tiling shell's per-instance
 * Jotai store like the plot/map/raw tiles' state; layout persistence
 * snapshots it per dataset.
 */
export const episodeLogTileSettingsAtom = atom<EpisodeLogTileSettingsByTile>(
  {},
);

/** Subscribe to the surrounding log tile's view settings. */
export function useEpisodeLogTileSettings(): EpisodeLogTileSettings {
  const tileId = useTileId();
  const byTile = useAtomValue(episodeLogTileSettingsAtom);
  return useMemo(
    () =>
      tileId
        ? { ...DEFAULT_EPISODE_LOG_TILE_SETTINGS, ...byTile[tileId] }
        : DEFAULT_EPISODE_LOG_TILE_SETTINGS,
    [byTile, tileId],
  );
}

/** Patch the surrounding log tile's view settings. */
export function useSetEpisodeLogTileSettings(): (
  patch: Partial<EpisodeLogTileSettings>,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (patch) => {
      if (!tileId) return;
      store.set(episodeLogTileSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_EPISODE_LOG_TILE_SETTINGS,
          ...previous[tileId],
        };
        const next = { ...current, ...patch };
        if (
          next.enabledStreams === current.enabledStreams &&
          next.followPlayhead === current.followPlayhead &&
          next.selectedLevels === current.selectedLevels
        ) {
          return previous;
        }
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}
