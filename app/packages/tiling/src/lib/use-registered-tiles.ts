import { useAtomValue } from "jotai";
import { registeredTilesAtom } from "./atoms";
import type { RegisteredTile } from "./types";

/**
 * Returns every registered tile, in registration order. Re-renders
 * whenever a tile registers or unregisters.
 *
 * Most UIs want either `useTileTypes()` (deduped) or
 * `useTileSourcesByType(type)` (filtered) — use this only when you
 * need the raw flat list.
 */
export function useRegisteredTiles(): RegisteredTile[] {
  return useAtomValue(registeredTilesAtom);
}
