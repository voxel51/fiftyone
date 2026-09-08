import { subscribe } from "@fiftyone/relay";
import { useRecoilCallback } from "recoil";
import {
  extendedStages,
  filters,
  patching,
  selectedSamples,
  view,
  viewStateForm_INTERNAL,
} from "../recoil";
import resolveActiveGroupSliceForView from "./resolveActiveGroupSliceForView";

export default function useToEvaluationPatches() {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (evaluation) => {
        set(patching, true);
        const { slice, updater } =
          await resolveActiveGroupSliceForView(snapshot);
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
          slice,
          filters: await snapshot.getPromise(filters),
          extended: await snapshot.getPromise(extendedStages),
          sampleIds: Array.from(
            (await snapshot.getPromise(selectedSamples)).keys(),
          ),
        });
        set(view, updater);
        const unsubscribe = subscribe((_, { reset, set }) => {
          reset(viewStateForm_INTERNAL);
          set(patching, false);
          unsubscribe();
        });
      },
    [],
  );
}
