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

        record?.setValue(JSON.stringify(sample), "sample");
      });
    },
    [environment]
  );
};

export default useUpdateSample;
