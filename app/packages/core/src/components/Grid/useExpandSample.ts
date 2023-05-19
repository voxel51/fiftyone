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
      expandSample(clickedIndex);
    },
    [store]
  );
};
