import { useTiling } from "@fiftyone/tiling";
import { useAtomValue, useStore } from "jotai";
import { useCallback } from "react";
import {
  mcapRawTileTopicAtom,
  type McapRawTileTopics,
} from "./mcap-raw-tile-state";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import { getMcapTileDefinition } from "./use-mcap-tiles";

/**
 * Opens a Message panel for a topic: focus an existing matching raw tile,
 * reuse an empty raw tile, or create a new raw tile with the topic preselected.
 */
export function useOpenMcapRawMessageTile(): (topic: string) => void {
  const { addTile, setFocusedTileId, tiles } = useTiling();
  const topicsByTile = useAtomValue(mcapRawTileTopicAtom);
  const store = useStore();

  return useCallback(
    (topic: string) => {
      if (!topic) {
        return;
      }

      const rawTileIds = Object.keys(tiles).filter(
        (tileId) => tiles[tileId]?.type === MCAP_TILE_TYPE.RAW,
      );
      const matchingTileId = rawTileIds.find(
        (tileId) => topicsByTile[tileId] === topic,
      );
      if (matchingTileId) {
        setFocusedTileId(matchingTileId);
        return;
      }

      const emptyTileId = rawTileIds.find((tileId) => !topicsByTile[tileId]);
      if (emptyTileId) {
        setRawTileTopic(store, emptyTileId, topic);
        setFocusedTileId(emptyTileId);
        return;
      }

      const definition = getMcapTileDefinition(MCAP_TILE_TYPE.RAW);
      if (!definition) {
        return;
      }
      const Tile = definition.Tile;
      const tileId = addTile(
        {
          render: () => <Tile />,
          title: topic,
          type: MCAP_TILE_TYPE.RAW,
        },
        { idPrefix: MCAP_TILE_TYPE.RAW },
      );
      setRawTileTopic(store, tileId, topic);
    },
    [addTile, setFocusedTileId, store, tiles, topicsByTile],
  );
}

function setRawTileTopic(
  store: ReturnType<typeof useStore>,
  tileId: string,
  topic: string,
): void {
  store.set(mcapRawTileTopicAtom, (previous: McapRawTileTopics) => {
    if (previous[tileId] === topic) {
      return previous;
    }
    return { ...previous, [tileId]: topic };
  });
}
