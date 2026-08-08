import { useStore } from "jotai";
import { useCallback } from "react";
import { registeredTilesAtom } from "./atoms";
import { useTileScopeId } from "./TilingProvider";
import type { RegisteredTile } from "./types";

/**
 * Register a tile kind (one per `type`). Returns a disposer; call it
 * from a cleanup effect. Re-registering the same `type` replaces the
 * previous entry.
 *
 * Registrations belong to the nearest `<TilingProvider>`, so two shells
 * sharing a Jotai store keep separate "Add tile" catalogs.
 */
export function useTileRegistry(): {
  registerTile: (entry: RegisteredTile) => () => void;
} {
  const store = useStore();
  const scopeId = useTileScopeId();
  const tilesAtom = registeredTilesAtom(scopeId);
  const registerTile = useCallback(
    (entry: RegisteredTile) => {
      store.set(tilesAtom, (prev) => {
        const index = prev.findIndex((t) => t.type === entry.type);
        if (index === -1) return [...prev, entry];
        const next = [...prev];
        next[index] = entry;
        return next;
      });
      // Filter by identity, not by type — otherwise an older disposer
      // could remove a newer same-type registration that has since
      // replaced this one.
      return () => {
        store.set(tilesAtom, (prev) => prev.filter((t) => t !== entry));
      };
    },
    [store, tilesAtom],
  );
  return { registerTile };
}
