import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { RegisteredTile } from "./types";

/**
 * Composite key for per-tile atoms.
 *
 * Tile ids are generated per provider from a fresh `<prefix>-<n>`
 * counter, so two shells mounted against the SAME Jotai store both
 * produce `camera-1`. Keying by scope keeps their state apart. The NUL
 * separator can't appear in either half, so the mapping is injective.
 */
export const tileScopedKey = (scopeId: string, tileId: string) =>
  `${scopeId}\u0000${tileId}`;

/** Registered tile kinds, in registration order, per provider scope.
 *  Consumed by the "Add tile" menu via `useTileTypes()`. */
export const registeredTilesAtom = atomFamily((_scopeId: string) =>
  atom<RegisteredTile[]>([]),
);

/** Per-tile selection payload — whatever the tile body publishes when
 *  the user clicks something inspectable. The inspector sidebar reads
 *  the focused tile's value. Keyed by {@link tileScopedKey}. */
// Cast preserves the writable shape; jotai's null-narrowed overload
// resolves to a read-only Atom otherwise.
export const tileSelectionAtom = atomFamily(
  (_scopedKey: string) => atom<unknown>(null) as PrimitiveAtom<unknown>,
);
