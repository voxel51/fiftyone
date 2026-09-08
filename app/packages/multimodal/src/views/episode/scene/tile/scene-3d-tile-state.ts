import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";

/** Persisted playback presentation settings owned by one 3D tile. */
export interface Scene3dTilePlaybackSettings {
  readonly smoothTrackedLabels: boolean;
}

/** Playback presentation settings keyed by 3D tile id. */
export type Scene3dTilePlaybackSettingsByTile = Readonly<
  Record<string, Scene3dTilePlaybackSettings>
>;

export const DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS: Scene3dTilePlaybackSettings =
  {
    smoothTrackedLabels: false,
  };

/** Shell-scoped state mirrored into dataset layout persistence. */
export const scene3dTilePlaybackSettingsAtom =
  atom<Scene3dTilePlaybackSettingsByTile>({});

/** Subscribe to playback presentation settings for the surrounding 3D tile. */
export function useScene3dTilePlaybackSettings(): Scene3dTilePlaybackSettings {
  const tileId = useTileId();
  const byTile = useAtomValue(scene3dTilePlaybackSettingsAtom);
  return useMemo(
    () =>
      tileId
        ? {
            ...DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS,
            ...byTile[tileId],
          }
        : DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS,
    [byTile, tileId],
  );
}

/** Patch playback presentation settings for the surrounding 3D tile. */
export function useSetScene3dTilePlaybackSettings(): (
  patch: Partial<Scene3dTilePlaybackSettings>,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (patch) => {
      if (!tileId) return;
      store.set(scene3dTilePlaybackSettingsAtom, (previous) => {
        const current = {
          ...DEFAULT_SCENE_3D_TILE_PLAYBACK_SETTINGS,
          ...previous[tileId],
        };
        const next = { ...current, ...patch };
        if (next.smoothTrackedLabels === current.smoothTrackedLabels) {
          return previous;
        }
        return { ...previous, [tileId]: next };
      });
    },
    [store, tileId],
  );
}
