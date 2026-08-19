import { subscribe } from "@fiftyone/relay";
import { useRecoilCallback } from "recoil";
import {
  _activeFields,
  extendedStages,
  filters,
  patching,
  selectedSamples,
  view,
  viewStateForm_INTERNAL,
} from "../recoil";
import resolveActiveGroupSliceForView from "./resolveActiveGroupSliceForView";

export default function useToPatches() {
  return useRecoilCallback(
    ({ set, snapshot }) =>
      async (field) => {
        set(patching, true);
        const { slice, updater } =
          await resolveActiveGroupSliceForView(snapshot);
        set(viewStateForm_INTERNAL, {
          addStages: [
            {
              _cls: "fiftyone.core.stages.ToPatches",
              kwargs: [
                ["field", field],
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

        const unsubscribe = subscribe((_, { reset, set, get }) => {
          reset(viewStateForm_INTERNAL);
          set(patching, false);
          // Ensure patched field is added to active fields
          const currentFields = get(_activeFields({ modal: false })) ?? [];
          if (!currentFields.includes(field)) {
            set(_activeFields({ modal: false }), [field, ...currentFields]);
          }
          unsubscribe();
        });
      },
    [],
  );
}
