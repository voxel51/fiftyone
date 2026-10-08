import { subscribe } from "@fiftyone/relay";
import { useReverbCallback } from "@fiftyone/reverb";
import {
  extendedStages,
  filters,
  groupSlice,
  patching,
  selectedSamples,
  view,
  viewStateForm_INTERNAL,
} from "../atoms";

export default function useToClips() {
  return useReverbCallback(
    ({ set, snapshot }) =>
      async (field) => {
        set(patching, true);
        set(viewStateForm_INTERNAL, {
          addStages: [
            {
              _cls: "fiftyone.core.stages.ToClips",
              kwargs: [
                ["field_or_expr", field],
                ["_state", null],
              ],
            },
          ],
          slice: await snapshot.getPromise(groupSlice),
          filters: await snapshot.getPromise(filters),
          extended: await snapshot.getPromise(extendedStages),
          sampleIds: Array.from(
            (await snapshot.getPromise(selectedSamples)).keys(),
          ),
        });
        set(view, (v) => v);
        const unsubscribe = subscribe((_, { reset, set }) => {
          reset(viewStateForm_INTERNAL);
          set(patching, false);
          unsubscribe();
        });
      },
    [],
  );
}
