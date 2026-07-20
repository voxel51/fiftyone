import { useTiling, type TilingTile } from "@fiftyone/tiling";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import {
  episodeRawTileStreamAtom,
  type EpisodeRawTileStreams,
} from "./episode-raw-tile-state";
import { EPISODE_TILE_TYPE } from "../tiles/episode-tile-types";
import { getEpisodeTileDefinition } from "../tiles/use-episode-tiles";

/**
 * Opens a Message panel for a stream: focus an existing matching raw tile,
 * reuse an empty raw tile, or create a new raw tile with the stream preselected.
 */
export function useOpenEpisodeRawMessageTile(): (stream: string) => void {
  const { addTile, setFocusedTileId, setTileTitle, tiles } = useTiling();
  const streamsByTile = useAtomValue(episodeRawTileStreamAtom);
  const setStreamsByTile = useSetAtom(episodeRawTileStreamAtom);
  const stateRef = useRef({ tiles, streamsByTile });
  stateRef.current = { tiles, streamsByTile };

  return useCallback(
    (stream: string) => {
      if (!stream) {
        return;
      }

      const current = stateRef.current;
      const rawTileIds = Object.keys(current.tiles).filter(
        (tileId) => current.tiles[tileId]?.type === EPISODE_TILE_TYPE.RAW,
      );
      const matchingTileId = rawTileIds.find(
        (tileId) => current.streamsByTile[tileId] === stream,
      );
      if (matchingTileId) {
        setFocusedTileId(matchingTileId);
        return;
      }

      const emptyTileId = rawTileIds.find(
        (tileId) => !current.streamsByTile[tileId],
      );
      if (emptyTileId) {
        const nextStreams = setRawTileStream(
          current.streamsByTile,
          emptyTileId,
          stream,
        );
        const emptyTile = current.tiles[emptyTileId];
        stateRef.current = {
          tiles: emptyTile
            ? {
                ...current.tiles,
                [emptyTileId]: { ...emptyTile, title: stream },
              }
            : current.tiles,
          streamsByTile: nextStreams,
        };
        setStreamsByTile((previous) =>
          setRawTileStream(previous, emptyTileId, stream),
        );
        setTileTitle(emptyTileId, stream, { source: "auto" });
        setFocusedTileId(emptyTileId);
        return;
      }

      const definition = getEpisodeTileDefinition(EPISODE_TILE_TYPE.RAW);
      if (!definition) {
        return;
      }
      const Tile = definition.Tile;
      const tile: TilingTile = {
        render: () => <Tile />,
        title: stream,
        type: EPISODE_TILE_TYPE.RAW,
      };
      const tileId = addTile(tile, { idPrefix: EPISODE_TILE_TYPE.RAW });
      const nextStreams = setRawTileStream(
        current.streamsByTile,
        tileId,
        stream,
      );
      stateRef.current = {
        tiles: { ...current.tiles, [tileId]: tile },
        streamsByTile: nextStreams,
      };
      setStreamsByTile((previous) =>
        setRawTileStream(previous, tileId, stream),
      );
      setFocusedTileId(tileId);
    },
    // setStreamsByTile is a stable useSetAtom setter; omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addTile, setFocusedTileId, setTileTitle],
  );
}

function setRawTileStream(
  previous: EpisodeRawTileStreams,
  tileId: string,
  stream: string,
): EpisodeRawTileStreams {
  if (previous[tileId] === stream) {
    return previous;
  }
  return { ...previous, [tileId]: stream };
}
