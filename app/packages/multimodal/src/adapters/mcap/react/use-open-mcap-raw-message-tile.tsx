import { useTiling, type TilingTile } from "@fiftyone/tiling";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
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
  const { addTile, setFocusedTileId, setTileTitle, tiles } = useTiling();
  const topicsByTile = useAtomValue(mcapRawTileTopicAtom);
  const setTopicsByTile = useSetAtom(mcapRawTileTopicAtom);
  const stateRef = useRef({ tiles, topicsByTile });
  stateRef.current = { tiles, topicsByTile };

  return useCallback(
    (topic: string) => {
      if (!topic) {
        return;
      }

      const current = stateRef.current;
      const rawTileIds = Object.keys(current.tiles).filter(
        (tileId) => current.tiles[tileId]?.type === MCAP_TILE_TYPE.RAW,
      );
      const matchingTileId = rawTileIds.find(
        (tileId) => current.topicsByTile[tileId] === topic,
      );
      if (matchingTileId) {
        setFocusedTileId(matchingTileId);
        return;
      }

      const emptyTileId = rawTileIds.find(
        (tileId) => !current.topicsByTile[tileId],
      );
      if (emptyTileId) {
        const nextTopics = setRawTileTopic(
          current.topicsByTile,
          emptyTileId,
          topic,
        );
        const emptyTile = current.tiles[emptyTileId];
        stateRef.current = {
          tiles: emptyTile
            ? {
                ...current.tiles,
                [emptyTileId]: { ...emptyTile, title: topic },
              }
            : current.tiles,
          topicsByTile: nextTopics,
        };
        setTopicsByTile((previous) =>
          setRawTileTopic(previous, emptyTileId, topic),
        );
        setTileTitle(emptyTileId, topic, { source: "auto" });
        setFocusedTileId(emptyTileId);
        return;
      }

      const definition = getMcapTileDefinition(MCAP_TILE_TYPE.RAW);
      if (!definition) {
        return;
      }
      const Tile = definition.Tile;
      const tile: TilingTile = {
        render: () => <Tile />,
        title: topic,
        type: MCAP_TILE_TYPE.RAW,
      };
      const tileId = addTile(tile, { idPrefix: MCAP_TILE_TYPE.RAW });
      const nextTopics = setRawTileTopic(current.topicsByTile, tileId, topic);
      stateRef.current = {
        tiles: { ...current.tiles, [tileId]: tile },
        topicsByTile: nextTopics,
      };
      setTopicsByTile((previous) => setRawTileTopic(previous, tileId, topic));
      setFocusedTileId(tileId);
    },
    // setTopicsByTile is a stable useSetAtom setter; omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addTile, setFocusedTileId, setTileTitle],
  );
}

function setRawTileTopic(
  previous: McapRawTileTopics,
  tileId: string,
  topic: string,
): McapRawTileTopics {
  if (previous[tileId] === topic) {
    return previous;
  }
  return { ...previous, [tileId]: topic };
}
