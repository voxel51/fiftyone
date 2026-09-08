import {
  useRegisteredTiles,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { rawTileStreamAtom, type RawTileStreams } from "./raw-message-binding";
import { TILE_TYPE } from "./tile-types";

/** Canonical raw-stream binding plus the user-facing name used for titles. */
export interface RawMessageTileTarget {
  readonly sourceName: string;
  readonly streamId: string;
}

/**
 * Opens a Message panel for a stream: focus an existing matching raw tile,
 * reuse an empty raw tile, or create a new raw tile with the stream preselected.
 */
export function useOpenRawMessageTile(): (
  target: RawMessageTileTarget,
) => void {
  const { addTile, setFocusedTileId, setTileTitle, tiles } = useTiling();
  const registeredTiles = useRegisteredTiles();
  const streamsByTile = useAtomValue(rawTileStreamAtom);
  const setStreamsByTile = useSetAtom(rawTileStreamAtom);
  const stateRef = useRef({ registeredTiles, tiles, streamsByTile });
  stateRef.current = { registeredTiles, tiles, streamsByTile };

  return useCallback(
    ({ sourceName, streamId }: RawMessageTileTarget) => {
      if (!streamId) {
        return;
      }

      const current = stateRef.current;
      const rawTileIds = Object.keys(current.tiles).filter(
        (tileId) => current.tiles[tileId]?.type === TILE_TYPE.RAW,
      );
      const matchingTileId = rawTileIds.find(
        (tileId) => current.streamsByTile[tileId] === streamId,
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
          streamId,
        );
        const emptyTile = current.tiles[emptyTileId];
        stateRef.current = {
          registeredTiles: current.registeredTiles,
          tiles: emptyTile
            ? {
                ...current.tiles,
                [emptyTileId]: { ...emptyTile, title: sourceName },
              }
            : current.tiles,
          streamsByTile: nextStreams,
        };
        setStreamsByTile((previous) =>
          setRawTileStream(previous, emptyTileId, streamId),
        );
        setTileTitle(emptyTileId, sourceName, { source: "auto" });
        setFocusedTileId(emptyTileId);
        return;
      }

      const definition = current.registeredTiles.find(
        (entry) => entry.type === TILE_TYPE.RAW,
      );
      if (!definition) return;
      const RawMessageTile = definition.Tile;
      const tile: TilingTile = {
        render: () => <RawMessageTile />,
        title: sourceName,
        type: TILE_TYPE.RAW,
      };
      const tileId = addTile(tile, { idPrefix: TILE_TYPE.RAW });
      const nextStreams = setRawTileStream(
        current.streamsByTile,
        tileId,
        streamId,
      );
      stateRef.current = {
        registeredTiles: current.registeredTiles,
        tiles: { ...current.tiles, [tileId]: tile },
        streamsByTile: nextStreams,
      };
      setStreamsByTile((previous) =>
        setRawTileStream(previous, tileId, streamId),
      );
      setFocusedTileId(tileId);
    },
    [addTile, setFocusedTileId, setStreamsByTile, setTileTitle],
  );
}

function setRawTileStream(
  previous: RawTileStreams,
  tileId: string,
  stream: string,
): RawTileStreams {
  if (previous[tileId] === stream) {
    return previous;
  }
  return { ...previous, [tileId]: stream };
}
