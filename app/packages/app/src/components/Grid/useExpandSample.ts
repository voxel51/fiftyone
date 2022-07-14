import { FlashlightConfig } from "@fiftyone/flashlight";
import { useCallback } from "react";
import useSetGroup from "./useSetGroup";

import * as fos from "@fiftyone/state";

export default <T extends fos.Lookers>(store: fos.LookerStore<T>) => {
  const expandSample = fos.useExpandSample();
  const setGroup = useSetGroup();
  const clear = fos.useClearModal();

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

      const expand = (index: number, sample?: fos.SampleData) =>
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
