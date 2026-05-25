import { createContext, useContext } from "react";
import type { PlaybackStore } from "./types";

/**
 * Per-instance Jotai store for the surrounding `<PlaybackProvider>`.
 *
 * Exposed through a regular React context (not Jotai's `<Provider>`) so
 * the playback hooks can target this store EXPLICITLY via
 * `useAtomValue(atom, { store })`. That side-steps Jotai's
 * "nearest-Provider wins" lookup, which would otherwise let any nested
 * `<JotaiProvider>` (e.g. the one TilingProvider mounts) shadow the
 * playback store and make every `useAtomValue` read the wrong values.
 */
export const PlaybackStoreContext = createContext<PlaybackStore | null>(null);

/**
 * The store backing the surrounding `<PlaybackProvider>`. Used internally
 * by every reactive read hook in this package — never reach for
 * `useStore()` from `jotai` directly, since that would resolve to the
 * nearest Jotai Provider rather than the playback one.
 */
export function usePlaybackStore(): PlaybackStore {
  const store = useContext(PlaybackStoreContext);
  if (!store) {
    throw new Error(
      "usePlaybackStore must be used inside a <PlaybackProvider>"
    );
  }
  return store;
}
