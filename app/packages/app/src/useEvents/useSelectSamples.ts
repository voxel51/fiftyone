import { type SelectedSamplesMeta, useSessionSetter } from "@fiftyone/state";
import { useCallback } from "react";
import type { EventHandlerHook } from "./registerEvent";

const useSelectSamples: EventHandlerHook = () => {
  const setter = useSessionSetter();
  return useCallback(
    (payload) => {
      const sampleIds = payload.sample_ids || [];
      setter("selectedSamples", new Set(sampleIds));
      if (payload.meta) {
        setter("selectedMeta", payload.meta);
      } else {
        // Generate default meta for all samples
        const meta: SelectedSamplesMeta = {};
        for (const id of sampleIds) {
          meta[id] = { type: "default" };
        }
        setter("selectedMeta", meta);
      }
    },
    [setter]
  );
};

export default useSelectSamples;
