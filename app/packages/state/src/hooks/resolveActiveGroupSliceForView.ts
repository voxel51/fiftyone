import type { Snapshot } from "recoil";
import { groupSlice, isGroup, view } from "../recoil";
import type { State } from "../recoil";

const SELECT_GROUP_SLICES = "fiftyone.core.stages.SelectGroupSlices";

/**
 * Conversion stages (e.g. ToPatches) require a flattened collection, so
 * grouped views without a SelectGroupSlices stage have one appended for the
 * active slice. Otherwise the view and form slice are unchanged
 */
export default async function resolveActiveGroupSliceForView(
  snapshot: Snapshot,
): Promise<{
  slice: string | null;
  updater: (stages: State.Stage[]) => State.Stage[];
}> {
  const slice = await snapshot.getPromise(groupSlice);
  const group = await snapshot.getPromise(isGroup);
  const stages = await snapshot.getPromise(view);

  if (
    !group ||
    !slice ||
    stages?.some(({ _cls }) => _cls === SELECT_GROUP_SLICES)
  ) {
    return { slice, updater: (v) => v };
  }

  return {
    slice: null,
    updater: (v) => [
      ...v,
      {
        _cls: SELECT_GROUP_SLICES,
        kwargs: [
          ["slices", slice],
          ["media_type", null],
          ["flat", true],
        ],
      },
    ],
  };
}
