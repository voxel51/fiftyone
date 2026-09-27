import { useTrackPinning } from "@fiftyone/playback";
import React, { useEffect, useRef } from "react";

/**
 * Pins each of `ids` the first time it appears under the enclosing
 * `TrackProvider`, and never again, so a row the reader unpins stays unpinned. Explicit rather than
 * through `initialPinnedIds`, which a stored pin set for the sample overrides:
 * these rows only exist while there is something to show, so one left in the
 * drawer is one nobody sees.
 */
export const PinOnAppear: React.FC<{ ids: readonly string[] }> = ({ ids }) => {
  const { setPinned } = useTrackPinning();
  const pinned = useRef(new Set<string>());
  useEffect(() => {
    for (const id of ids) {
      if (!pinned.current.has(id)) {
        pinned.current.add(id);
        setPinned(id, true);
      }
    }
  }, [ids, setPinned]);

  return null;
};
