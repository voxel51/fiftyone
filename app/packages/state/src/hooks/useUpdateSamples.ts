import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import type { ModalSample } from "../recoil";
import { stores } from "./useLookerStore";

/**
 * For generated view samples (patches/clips/frames), update the source
 * sample's cached label data in the Relay store so the modal shows fresh
 * data when the user returns to the source dataset view.
 *
 * The patch sample's `_id` is the label's `_id` within the source sample.
 * We find that label in the source sample's fields and replace it with the
 * updated data from the patch sample.
 */
function updateSourceSampleLabel(
  store: Parameters<Parameters<typeof commitLocalUpdate>[1]>[0],
  patchSample: Record<string, unknown>
): void {
  const sourceSampleId = patchSample._sample_id;
  if (typeof sourceSampleId !== "string") return;

  const patchLabelId = patchSample._id;

  const sourceIds = [sourceSampleId, `${sourceSampleId}-modal`];
  for (const sourceId of sourceIds) {
    const sourceRecord = store.get(sourceId);
    if (!sourceRecord) continue;

    const raw = sourceRecord.getValue("sample");
    if (typeof raw !== "string") continue;

    let sourceSample: Record<string, unknown>;
    try {
      sourceSample = JSON.parse(raw);
    } catch {
      continue;
    }

    let updated = false;
    for (const [fieldName, fieldValue] of Object.entries(sourceSample)) {
      if (
        !fieldValue ||
        typeof fieldValue !== "object" ||
        Array.isArray(fieldValue)
      ) {
        continue;
      }

      // Look for array sub-fields (e.g. detections, classifications, polylines)
      for (const [listKey, listValue] of Object.entries(
        fieldValue as Record<string, unknown>
      )) {
        if (!Array.isArray(listValue)) continue;

        const idx = listValue.findIndex(
          (item: Record<string, unknown>) => item?._id === patchLabelId
        );

        if (idx !== -1 && patchSample[fieldName]) {
          listValue[idx] = {
            ...(listValue[idx] as Record<string, unknown>),
            ...(patchSample[fieldName] as Record<string, unknown>),
          };
          updated = true;
          break;
        }
      }
      if (updated) break;
    }

    if (updated) {
      sourceRecord.setValue(JSON.stringify(sourceSample), "sample");
    }
  }
}

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

          updateSourceSampleLabel(
            store,
            sample as unknown as Record<string, unknown>
          );
        }
      });
    },
    [environment]
  );
};

export default useUpdateSamples;
