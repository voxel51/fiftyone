import { useTiling } from "@fiftyone/tiling";
import { useCallback } from "react";
import { useSceneInventory } from "../../scene-inventory";
import { useEpisodeImageTileBindings } from "./episode-tile-source-bindings";
import { EPISODE_TILE_TYPE } from "./episode-tile-types";
import { getEpisodeTileDefinition } from "./use-episode-tiles";

/**
 * Opens the modal's view of an image stream: focuses the tile already
 * showing it, or spawns a new image tile bound to it. Shared by every
 * "take me to this camera" affordance — the source-first add-tile menu
 * and the clickable 3D frustums.
 */
export function useOpenEpisodeImageTile(): (sourceId: string) => void {
  const { addTile, setFocusedTileId } = useTiling();
  const sources = useSceneInventory();
  const bindings = useEpisodeImageTileBindings();

  return useCallback(
    (sourceId: string) => {
      if (!sourceId) return;
      const boundTileId = Object.keys(bindings).find(
        (tileId) => bindings[tileId] === sourceId,
      );
      if (boundTileId) {
        setFocusedTileId(boundTileId);
        return;
      }
      const definition = getEpisodeTileDefinition(EPISODE_TILE_TYPE.IMAGE);
      if (!definition) return;
      const Tile = definition.Tile;
      const title =
        sources.find((source) => source.id === sourceId)?.label ?? sourceId;
      addTile(
        {
          render: () => <Tile initialSourceId={sourceId} />,
          title,
          type: EPISODE_TILE_TYPE.IMAGE,
        },
        { idPrefix: EPISODE_TILE_TYPE.IMAGE },
      );
    },
    [addTile, bindings, setFocusedTileId, sources],
  );
}
