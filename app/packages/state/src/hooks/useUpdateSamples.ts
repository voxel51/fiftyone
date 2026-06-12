import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { ModalSample } from "../recoil";
import { stores } from "./useLookerStore";

export const useUpdateSamples = () => {
  const environment = useRelayEnvironment();

  return useCallback(
    (samples: [string, ModalSample["sample"] | undefined][]) => {
      commitLocalUpdate(environment, (store) => {
        for (const [id, sample] of samples) {
          if (!sample) continue;

          // Repaint this sample's tile in place in every registered view
          // (modal + grid) — no full grid refresh.
          for (const sampleStore of stores) {
            sampleStore.updateSample(id, sample);
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
        }
      });
    },
    [environment]
  );
};

export default useUpdateSamples;
