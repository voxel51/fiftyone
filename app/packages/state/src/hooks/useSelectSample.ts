import { selectedSamples } from "@fiftyone/state/src/recoil";
import { useRecoilCallback } from "recoil";

const useSelectSample = () => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string) => {
        const selected = new Set(await snapshot.getPromise(selectedSamples));
        selected.has(sampleId)
          ? selected.delete(sampleId)
          : selected.add(sampleId);
        set(selectedSamples, selected);
      },
    []
  );
};

export default useSelectSample;
