import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { ModalSample } from "../recoil";
import { useBumpLocalSampleVersions } from "../recoil/modal";
import {
  deleteLocalSample,
  setLocalSample,
  type SampleWriteSource,
} from "../stores/sampleStore";
import { stores } from "./useLookerStore";

export type UpdateSamplesOptions = {
  /**
   * Who produced this data. `"editor"` marks a write-through from the
   * annotation editor itself (the scene already shows it); everything else is
   * `"external"` (the default) and tells annotation surfaces to re-read.
   */
  source?: SampleWriteSource;
};

/**
 * The single write path for client-side sample updates. One call updates the
 * canonical local copy (`stores/sampleStore`) and fans the same data out to
 * every view holding it — registered looker stores (modal + grid tiles) and
 * Relay records — so no consumer is ever left rendering a stale snapshot.
 */
export const useUpdateSamples = () => {
  const environment = useRelayEnvironment();
  const bumpVersions = useBumpLocalSampleVersions();

  return useCallback(
    (
      samples: [string, ModalSample["sample"] | undefined][],
      options?: UpdateSamplesOptions
    ) => {
      // Every sample id whose overlaying selectors must re-evaluate.
      const changed = new Set<string>();

      commitLocalUpdate(environment, (store) => {
        for (const [id, sample] of samples) {
          if (!sample) continue;

          // Canonical local copy first; the version bump below re-evaluates
          // any selector overlaying it (e.g. `modalSample`).
          setLocalSample(id, sample, options?.source ?? "external");
          changed.add(id);

          // Repaint this sample's tile in place in every registered view
          // (modal + grid) — no full grid refresh.
          for (const sampleStore of stores) {
            sampleStore.updateSample(id, sample);
          }

          const ids = [id, `${id}-modal`];
          for (const recordId of ids) {
            const record = store.get(recordId);
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

          // For generated views (patches/clips/frames), drop the source
          // sample's cached copies so the next modal open fetches fresh data
          const sourceSampleId = (sample as Record<string, unknown>)._sample_id;
          if (typeof sourceSampleId === "string") {
            store.delete(`${sourceSampleId}-modal`);
            deleteLocalSample(sourceSampleId);
            changed.add(sourceSampleId);
          }
        }
      });

      bumpVersions(changed);
    },
    [environment, bumpVersions]
  );
};

export default useUpdateSamples;
