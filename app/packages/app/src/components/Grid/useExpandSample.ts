import { FlashlightConfig } from "@fiftyone/flashlight";
import { useCallback } from "react";
import useExpandSample from "../../hooks/useExpandSample";
import { Lookers, LookerStore } from "../../hooks/useLookerStore";
import { SampleData } from "../../recoil/atoms";

export default <T extends Lookers>(store: LookerStore<T>) => {
  const expandSample = useExpandSample();

  return useCallback<
    (
      ...args: Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>
    ) => void
  >(
    (next, sampleId, itemIndexMap) => {
      const clickedIndex = itemIndexMap[sampleId];

      const expand = (index: number, sample?: SampleData) =>
        sample && expandSample(sample, { index, getIndex });

      const getIndex = (index: number) => {
        const promise = store.indices.has(index)
          ? Promise.resolve(store.samples.get(store.indices.get(index)))
          : next().then(() => {
              return store.indices.has(index)
                ? store.samples.get(store.indices.get(index))
                : null;
            });

        promise
          ? promise.then((sample) => {
              sample ? expand(index, sample) : null;
            })
          : null;
      };

      const sample = store.samples.get(sampleId);

      if (!sample) {
        throw new Error("sample not found");
      }

      expand(clickedIndex, sample);
    },
    [store]
  );
};
