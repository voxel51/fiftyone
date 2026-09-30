import { createContext, useContext } from "react";
import { useStore, type createStore } from "jotai";

export type TilingStore = ReturnType<typeof createStore>;

/**
 * The Jotai store backing the surrounding `<TilingProvider>`.
 *
 * Exposed through a regular React context (not Jotai's `<Provider>`) so the
 * tiling hooks can target this store EXPLICITLY via
 * `useAtomValue(atom, { store })`. Jotai has a single store context and
 * resolves every atom against the nearest `<Provider>`, so if tiling relied
 * on the ambient store it would either read the wrong store when a host
 * nests providers, or, when it mounts an isolating provider, shadow the
 * host's atoms for everything rendered inside a tile body. Same pattern as
 * `@fiftyone/playback`'s `PlaybackStoreContext`.
 */
export const TilingStoreContext = createContext<TilingStore | null>(null);

/**
 * The store tiling atoms live in. Inside a `<TilingProvider>` this is the
 * provider's store; outside one it falls back to the ambient Jotai store so
 * the read hooks stay usable in isolation (they return their placeholders).
 */
export function useTilingStore(): TilingStore {
  const tilingStore = useContext(TilingStoreContext);
  const ambientStore = useStore();
  return tilingStore ?? ambientStore;
}
