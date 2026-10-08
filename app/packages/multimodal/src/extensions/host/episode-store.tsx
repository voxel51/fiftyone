import { createStore, useStore } from "jotai";
import React, { createContext, useContext, useState } from "react";

export type EpisodeStore = ReturnType<typeof createStore>;

const EpisodeStoreContext = createContext<EpisodeStore | null>(null);

/**
 * Per-episode Jotai store for viewer-local state: tile bindings, plot
 * series, log and map settings, hover echo, selection, and the like.
 *
 * Handed down through a plain React context rather than Jotai's own
 * `<Provider>`. Jotai resolves every atom against the nearest `<Provider>`,
 * so mounting one here would shadow the host app's store for everything
 * rendered inside the shell, including tile bodies from other packages.
 * Episode hooks instead bind to this store explicitly via
 * `useAtomValue(atom, { store: useEpisodeStore() })`, which keeps two
 * mounted shells (duplicate MCAP explorer panels) isolated from each other
 * while leaving the ambient store untouched. Same pattern as
 * `@fiftyone/tiling`'s `TilingStoreContext` and `@fiftyone/playback`'s
 * `PlaybackStoreContext`.
 */
export const EpisodeStoreProvider: React.FC<{
  readonly children: React.ReactNode;
}> = ({ children }) => {
  const [store] = useState(createStore);
  return (
    <EpisodeStoreContext.Provider value={store}>
      {children}
    </EpisodeStoreContext.Provider>
  );
};

/**
 * The store episode atoms live in. Inside an `EpisodeStoreProvider` this is
 * the provider's store; outside one (tests, hooks rendered without a shell)
 * it falls back to the ambient Jotai store so the hooks stay usable.
 */
export function useEpisodeStore(): EpisodeStore {
  const episodeStore = useContext(EpisodeStoreContext);
  const ambientStore = useStore();
  return episodeStore ?? ambientStore;
}
