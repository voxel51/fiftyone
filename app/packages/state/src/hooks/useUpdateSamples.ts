import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { ModalSample } from "../recoil";
import { stores } from "./useLookerStore";

/**
 * Dispatched (on `window`) for each sample updated via {@link useUpdateSamples}.
 * The grid listens for this to repaint just that tile's looker in place —
 * without a full grid refresh. ``detail`` is ``{ id, sample }``.
 */
export const SAMPLE_UPDATED_EVENT = "fiftyone-sample-updated";

export const useUpdateSamples = () => {
  const environment = useRelayEnvironment();

  return useCallback(
    (samples: [string, ModalSample["sample"] | undefined][]) => {
      commitLocalUpdate(environment, (store) => {
        for (const [id, sample] of samples) {
          if (!sample) continue;

          for (const sampleStore of stores) {
            const record = sampleStore.samples.get(id);
            if (record) {
              sampleStore.samples.set(id, { ...record, sample });

              // @ts-ignore
              sampleStore.lookers.get(id)?.updateSample(sample);
            }
          }

          const ids = [id, `${id}-modal`];
          for (const id of ids) {
            const record = store.get(id);
            if (record) {
              if (sample) {
                // Relay will not allow objects when hydrating a scalar value
                // - https://github.com/voxel51/fiftyone/pull/2622
                // - https://github.com/facebook/relay/issues/91
                record?.setValue(JSON.stringify(sample), "sample");
              } else {
                record.invalidateRecord();
              }
            }
          }

          // For generated views (patches/clips/frames), delete the source
          // sample's cached modal record so the next modal open fetches fresh data
          const sourceSampleId = (sample as Record<string, unknown>)._sample_id;
          if (typeof sourceSampleId === "string") {
            store.delete(`${sourceSampleId}-modal`);
          }

          // Repaint this sample's grid tile in place (no full grid refresh).
          // The grid keeps its lookers in a separate cache, so it listens for
          // this event and calls `updateSample` on just the affected tile.
          window.dispatchEvent(
            new CustomEvent(SAMPLE_UPDATED_EVENT, { detail: { id, sample } })
          );
        }
      });
    },
    [environment]
  );
};

export default useUpdateSamples;
