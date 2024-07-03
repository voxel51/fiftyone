import { selectedSamples } from "@fiftyone/state/src/recoil";
import { useRecoilCallback } from "recoil";

const useSelectSample = () => {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (sampleId: string) => {
        let selected = new Set(await snapshot.getPromise(selectedSamples));
        const selectedObjects = new Map(
          await snapshot.getPromise(selectedSampleObjects)
        );
        const items = Array.from(selected);
        const map = flashlight.itemIndexes;
        const index = map[sampleId];

        if (shiftKey && !selected.has(sampleId)) {
          selected = addRange(index, items, map);
        } else if (shiftKey) {
          selected = removeRange(index, selected, map);
        } else {
          selected.has(sampleId)
            ? selected.delete(sampleId)
            : selected.add(sampleId);
        }

        if (selectedObjects.has(sampleId)) {
          selectedObjects.delete(sampleId);
        } else {
          selectedObjects.set(sampleId, sample);
        }

        set(selectedSamples, selected);
        set(selectedSampleObjects, selectedObjects);
        setSelected(new Set(selected));

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
