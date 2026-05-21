import { atom, type PrimitiveAtom } from "jotai";
import { atomFamily } from "jotai/utils";

/**
 * Per-tile-instance selected MCAP topic. Lives next to the MCAP tile
 * components — not in the tiling layer, since tiling has no business
 * knowing what a tile is bound to. Tile bodies and their settings
 * read/write this for the same `tileId` to stay in sync without
 * needing to share a React subtree.
 */
// `atom<string | null>(null)` resolves to a read-only `Atom<string>`
// under jotai's null-narrowed overload; cast preserves the writable
// shape so `useSetAtom(mcapTileTopicAtom(id))` retains its setter.
export const mcapTileTopicAtom = atomFamily(
  (_tileId: string) => atom<string | null>(null) as PrimitiveAtom<string | null>
);
