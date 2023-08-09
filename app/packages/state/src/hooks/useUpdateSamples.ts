import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import { AppSample } from "../recoil";
import { stores } from "./useLookerStore";

export const useUpdateSamples = () => {
  const environment = useRelayEnvironment();

  return useCallback(
    (samples: [string, AppSample | undefined][]) => {
      commitLocalUpdate(environment, (store) => {
        samples.forEach(([id, sample]) => {
          sample &&
            stores.forEach((sampleStore) => {
              const record = sampleStore.samples.get(id);
              if (record) {
                sampleStore.samples.set(id, { ...record, sample });

                // @ts-ignore
                sampleStore.lookers.get(id)?.updateSample(sample);
              }
            });
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
        });
      });
    },
    [environment]
  );
};

export default useUpdateSamples;
