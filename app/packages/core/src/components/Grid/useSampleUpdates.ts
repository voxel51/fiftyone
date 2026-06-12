import { registerSampleStore } from "@fiftyone/state";
import { useEffect } from "react";
import type { LookerCache } from "./types";

/**
 * Repaint a grid tile in place when its sample is updated elsewhere (e.g. an
 * annotation saved in the modal).
 *
 * The grid keeps its tile lookers in a private cache that the modal store does
 * not share, so we register it as a sample-update target. `useUpdateSamples`
 * then drives every view through one path — calling `updateSample` on just the
 * affected tile, so the change shows in the grid without a full refresh.
 */
export default function useSampleUpdates(cache: LookerCache) {
  useEffect(
    () =>
      registerSampleStore({
        updateSample: (id, sample) => {
          const looker = cache.get(id) as
            | { updateSample?: (sample: unknown) => void }
            | undefined;
          looker?.updateSample?.(sample);
        },
      }),
    [cache]
  );
}
