import { FlashlightConfig } from "@fiftyone/flashlight";
import { useCallback } from "react";

import * as fos from "@fiftyone/state";

export default <T extends fos.Lookers>(store: fos.LookerStore<T>) => {
  const expandSample = fos.useExpandSample();

  return useCallback<
    (
      ...args: Parameters<NonNullable<FlashlightConfig<number>["onItemClick"]>>
    ) => void
  >(
    (next, sampleId, itemIndexMap) => {
      const clickedIndex = itemIndexMap[sampleId];

      const getIndex = (index: number) => {
        const id = store.indices.get(index);

        const promise = id ? Promise.resolve(id) : next();

        return promise.then(() => {
          const id = store.indices.get(index);

          if (!id) {
            throw new Error("unable to paginate to next sample");
          }
          return id;
        });
      };

      expandSample(sampleId, clickedIndex, getIndex);
    },
    [expandSample, store]
  );
};
