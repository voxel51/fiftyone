import { useAtomValue } from "jotai";
import { registeredTilesAtom, type RegisteredTile } from "./atoms";

/**
 * Returns the currently-registered streams that declared
 * `PlaybackStream.tile`. Re-renders whenever a stream with tile
 * metadata registers or unregisters.
 *
 * The order matches registration order — useful so the add-tile menu
 * is stable across renders.
 */
export function useRegisteredTiles(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom);
}
