import { useCallback } from "react";
import { commitLocalUpdate, useRelayEnvironment } from "react-relay";
import { AppSample } from "../recoil";
import { stores } from "./useLookerStore";

export const useUpdateSample = () => {
  const environment = useRelayEnvironment();

  return useCallback(
    (sample: AppSample) => {
      const id = sample._id;
      stores.forEach((store) => {
        const record = store.samples.get(id);
        if (record) {
          store.samples.set(id, { ...record, sample });

          // @ts-ignore
          store.lookers.get(id)?.updateSample(sample);
        }
      });

      commitLocalUpdate(environment, (store) => {
        const record = store.get(id);

        // Relay will not allow objects when hydrating a scalar value
        // - https://github.com/voxel51/fiftyone/pull/2622
        // - https://github.com/facebook/relay/issues/91
        record?.setValue(JSON.stringify(sample), "sample");
      });
    },
    [environment]
  );
};

export default useUpdateSample;
