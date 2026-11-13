import { atomWithStorage, createJSONStorage } from "jotai/utils";
import { atomFamily } from "jotai-family";

/**
 * Per dataset, the label fields whose detection box outlines are hidden in
 * looker overlays. Boxes are shown by default. Persisted to localStorage.
 *
 * Internal to `@fiftyone/state`: read and change it through the hooks in
 * `../hooks.ts`; `useLookerOptions` passes it to lookers.
 */
export const hiddenBoundingBoxesAtom = atomFamily((datasetId: string) =>
  atomWithStorage<readonly string[]>(
    `fiftyone:hidden-bounding-boxes:${datasetId}`,
    [],
    createJSONStorage<readonly string[]>(() => localStorage),
    { getOnInit: true },
  ),
);
