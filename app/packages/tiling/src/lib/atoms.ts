// ---------------------------------------------------------------------------
// Tiling-scoped Jotai atoms. The `TilingProvider` mounts a Jotai
// `Provider` with its own `createStore()`, so multiple independent
// tiling instances on the same page each get their own copy of these
// values.
// ---------------------------------------------------------------------------

import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { RegisteredTile } from "./types";

/**
 * Flat list of every registered tile kind, in registration order.
 * Consumers call `registerTile` (see `use-tile-registry.ts`) to push
 * an entry; the "Add tile" menu reads it via `useTileTypes()`.
 */
export const registeredTilesAtom = atom<RegisteredTile[]>([]);

/**
 * Per-tile-id "current selection". Tile bodies write into this when
 * the user clicks something inspectable (a graph point, a scene
 * object, etc.); the inspector sidebar reads the focused tile's value
 * to render its details. Shape is intentionally `unknown` — each tile
 * can publish its own payload schema.
 */
// `atom<unknown>(null)` resolves to a read-only Atom under jotai's
// null-narrowed overload; cast preserves the writable shape so callers
// can `useSetAtom(tileSelectionAtom(id))`.
export const tileSelectionAtom = atomFamily(
  (_tileId: string) => atom<unknown>(null) as PrimitiveAtom<unknown>
);
