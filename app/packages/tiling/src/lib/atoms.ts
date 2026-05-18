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
 * Flat list of every registered tile. Consumers call `registerTile`
 * (see `use-tile-registry.ts`) to push an entry; the tiling header /
 * settings UI reads it via `useTileTypes()` / `useTileSourcesByType()`.
 *
 * Held in registration order so the menu stays stable across renders.
 */
export const registeredTilesAtom = atom<RegisteredTile[]>([]);

/**
 * Per-tile-id source binding. The value is the id of the source
 * (typically a playback stream) whose data this tile should render —
 * `null` when the tile is unbound (placeholder mode). Tiles read it
 * via `useTileSource()`; the settings panel writes it through
 * `useSetTileSource()`.
 */
// `atom<string | null>(null)` should resolve to PrimitiveAtom, but jotai's
// overloads narrow `Value` against the bare `null` argument and produce a
// read-only `Atom<string>`. The cast preserves the writable shape so
// `useSetAtom(tileSourceAtom(id))` keeps its setter signature.
export const tileSourceAtom = atomFamily(
  (_tileId: string) => atom<string | null>(null) as PrimitiveAtom<string | null>
);

/**
 * Per-tile-id "current selection". Tile bodies write into this when
 * the user clicks something inspectable (a graph point, a scene
 * object, etc.); the inspector sidebar reads the focused tile's value
 * to render its details. Shape is intentionally `unknown` — each tile
 * can publish its own payload schema.
 */
// See note on `tileSourceAtom` — same `null`-initial-value inference quirk.
export const tileSelectionAtom = atomFamily(
  (_tileId: string) => atom<unknown>(null) as PrimitiveAtom<unknown>
);
