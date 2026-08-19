import type { PlaybackStore } from "@fiftyone/playback/runtime";
import React, { createContext, useContext } from "react";

const EpisodePlaybackStoreContext = createContext<PlaybackStore | null>(null);

/** Supplies the host playback store to runtime contributions. */
export const EpisodePlaybackStoreProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly store: PlaybackStore;
}> = ({ children, store }) => (
  <EpisodePlaybackStoreContext.Provider value={store}>
    {children}
  </EpisodePlaybackStoreContext.Provider>
);

/** Returns the playback store mounted by the shared episode host. */
export function useEpisodePlaybackStore(): PlaybackStore {
  const store = useContext(EpisodePlaybackStoreContext);
  if (!store) {
    throw new Error("Episode runtime must be mounted inside its playback host");
  }
  return store;
}
