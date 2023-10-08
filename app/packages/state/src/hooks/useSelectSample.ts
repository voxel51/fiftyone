import { useRecoilCallback } from "recoil";
import { selectedSamples } from "../recoil";

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
