import type { PlaybackStore } from "@fiftyone/playback";
import React, { createContext, useContext } from "react";

const McapExtensionPlaybackStoreContext = createContext<PlaybackStore | null>(
  null,
);

/** Supplies the host playback store to runtime contributions. */
export const McapExtensionPlaybackStoreProvider: React.FC<{
  readonly children: React.ReactNode;
  readonly store: PlaybackStore;
}> = ({ children, store }) => (
  <McapExtensionPlaybackStoreContext.Provider value={store}>
    {children}
  </McapExtensionPlaybackStoreContext.Provider>
);

/** Playback store handle for runtime nodes mounted by an MCAP extension. */
export function useMcapExtensionPlaybackStore(): PlaybackStore {
  const store = useContext(McapExtensionPlaybackStoreContext);
  if (!store) {
    throw new Error(
      "MCAP extension runtime must be mounted inside its playback host",
    );
  }
  return store;
}
