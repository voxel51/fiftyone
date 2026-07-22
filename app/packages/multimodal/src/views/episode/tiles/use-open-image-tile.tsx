import { useRegisteredTiles, useTiling } from "@fiftyone/tiling";
import { useCallback, useRef, type ComponentType } from "react";
import { useSceneInventory } from "../../../scene-inventory/react";
import { useEpisodeImageTileBindings } from "./episode-tile-source-bindings";
import { EPISODE_TILE_TYPE, type EpisodeTileProps } from "./episode-tile-types";

/**
 * Opens the modal's view of an image stream: focuses the tile already
 * showing it, or spawns a new image tile bound to it. Shared by every
 * "take me to this camera" affordance — the source-first add-tile menu
 * and the clickable 3D frustums.
 */
export function useOpenEpisodeImageTile(): (sourceId: string) => void {
  const { addTile, setFocusedTileId } = useTiling();
  const registeredTiles = useRegisteredTiles();
  const sources = useSceneInventory();
  const bindings = useEpisodeImageTileBindings();
  const registeredTilesRef = useRef(registeredTiles);
  registeredTilesRef.current = registeredTiles;

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
      const definition = registeredTilesRef.current.find(
        (entry) => entry.type === EPISODE_TILE_TYPE.IMAGE,
      );
      if (!definition) return;
      const ImageTile = definition.Tile as ComponentType<
        EpisodeTileProps & { readonly initialSourceId?: string }
      >;
      const title =
        sources.find((source) => source.id === sourceId)?.label ?? sourceId;
      addTile(
        {
          render: () => <ImageTile initialSourceId={sourceId} />,
          title,
          type: EPISODE_TILE_TYPE.IMAGE,
        },
        { idPrefix: EPISODE_TILE_TYPE.IMAGE },
      );
    },
    [addTile, bindings, setFocusedTileId, sources],
  );
}
