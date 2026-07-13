import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";
import type { RegisteredTile } from "./types";

/** Registered tile kinds, in registration order. Consumed by the
 *  "Add tile" menu via `useTileTypes()`. */
export const registeredTilesAtom = atom<RegisteredTile[]>([]);

/** Per-tile selection payload — whatever the tile body publishes when
 *  the user clicks something inspectable. The inspector sidebar reads
 *  the focused tile's value. */
// Cast preserves the writable shape; jotai's null-narrowed overload
// resolves to a read-only Atom otherwise.
export const tileSelectionAtom = atomFamily(
  (_tileId: string) => atom<unknown>(null) as PrimitiveAtom<unknown>,
);
