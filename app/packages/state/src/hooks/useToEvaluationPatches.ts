import { subscribe } from "@fiftyone/relay";
import { useRecoilCallback } from "recoil";
import {
  extendedStages,
  filters,
  groupSlice,
  patching,
  selectedSamples,
  view,
  viewStateForm_INTERNAL,
} from "../recoil";

export default function useToEvaluationPatches() {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (evaluation) => {
        set(patching, true);
        set(viewStateForm_INTERNAL, {
          addStages: [
            {
              _cls: "fiftyone.core.stages.ToEvaluationPatches",
              kwargs: [
                ["eval_key", evaluation],
                ["_state", null],
              ],
            },
          ],
          slice: await snapshot.getPromise(groupSlice),
          filters: await snapshot.getPromise(filters),
          extended: await snapshot.getPromise(extendedStages),
          sampleIds: Array.from(await snapshot.getPromise(selectedSamples)),
        });
        set(view, (v) => v);
        const unsubscribe = subscribe((_, { reset, set }) => {
          reset(viewStateForm_INTERNAL);
          set(patching, false);
          unsubscribe();
        });
      },
    []
  );
}
