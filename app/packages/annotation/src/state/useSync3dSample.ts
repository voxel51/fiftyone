import { useWorkingDoc } from "@fiftyone/looker-3d";
import { useEffect } from "react";
import { build3dLabel } from "./build3dLabel";
import { useSampleInstance } from "./useSample";

/**
 * Mirror 3D working-store edits onto the shared {@link Sample} instance.
 *
 * The 3D annotation working store (Recoil, keyed by sampleId) is the source of
 * truth for cuboid/polyline edits. This hook subscribes to it reactively and,
 * on every committed mutation, pushes the current label set into Sample:
 * `updateLabel` for present labels and `deleteLabel` for soft-deleted ones.
 *
 * Re-writing unchanged labels is idempotent — Sample's merge-semantics diff
 * against the source, so identical labels emit no patch op.
 *
 * Subscribes to the working *doc* (referentially stable; only changes on a real
 * store mutation) rather than the filtered detection/polyline hooks, which
 * allocate a fresh array each render.
 *
 * Mount once at the annotation root.
 */
export const useSync3dSample = (): void => {
  const doc = useWorkingDoc();
  const sample = useSampleInstance();

  useEffect(() => {
    for (const label of Object.values(doc.labelsById)) {
      if (doc.deletedIds.has(label._id)) {
        continue;
      }

      const data = build3dLabel(label);
      if (data) {
        sample.updateLabel(label.path, data);
      }
    }

    for (const id of doc.deletedIds) {
      const label = doc.labelsById[id];
      if (label) {
        sample.deleteLabel(label.path, id);
      }
    }
  }, [doc, sample]);
};
