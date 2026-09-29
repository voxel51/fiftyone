import type { SelectionType } from "@fiftyone/state/src/atoms/types";
import { selectedSamples } from "../atoms";
import { useReverbCallback } from "@fiftyone/reverb";

const useSelectSample = () => {
  return useReverbCallback(
    ({ set, snapshot }) =>
      async (sampleId: string, altKey = false) => {
        const selected = new Map(await snapshot.getPromise(selectedSamples));
        const selectionType: SelectionType = altKey ? "alt" : "default";
        selected.has(sampleId)
          ? selected.delete(sampleId)
          : selected.set(sampleId, selectionType);
        set(selectedSamples, selected);
      },
    [],
  );
};

export default useSelectSample;
