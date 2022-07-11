import { FlashlightConfig } from "@fiftyone/flashlight";
import { useCallback } from "react";
import useClearModal from "../../hooks/useClearModal";
import useExpandSample from "../../hooks/useExpandSample";
import { Lookers, LookerStore } from "../../hooks/useLookerStore";
import { SampleData } from "../../recoil/atoms";
import useSetGroup from "./useSetGroup";

export default <T extends Lookers>(store: LookerStore<T>) => {
  const expandSample = useExpandSample();
  const setGroup = useSetGroup();
  const clear = useClearModal();

  return useCallback<
    (
      ...args: Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>
    ) => void
  >(
    (next, sampleId, itemIndexMap) => {
      setGroup();
      const clickedIndex = itemIndexMap[sampleId];

      const getIndex = (index: number) => {
        const id = store.indices.get(index);

        let promise;
        if (id) {
          promise = Promise.resolve(id);
        } else {
          promise = next().then(() => {
            const id = store.indices.get(index);

            if (!id) {
              throw new Error("unable to paginate to next sample");
            }

            return id;
          });
        }

        promise.then((id) => {
          id ? expand(index, store.samples.get(id)) : clear();
        });
      };

      const expand = (index: number, sample?: SampleData) =>
        sample && expandSample(sample, { index, getIndex });

      const sample = store.samples.get(sampleId);

      if (!sample) {
        throw new Error("sample not found");
      }

      expand(clickedIndex, sample);
    },
    [store]
  );
};
