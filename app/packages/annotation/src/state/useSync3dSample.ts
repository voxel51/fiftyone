import { useWorkingDoc } from "@fiftyone/looker-3d";
import { equalsNormalized } from "@fiftyone/utilities";
import { useEffect } from "react";
import { build3dLabel } from "./build3dLabel";
import { useSceneSampleId } from "./useGroupAnnotationSample";
import { useSampleInstance } from "./useSample";

/**
 * The 3D annotation WRITE-half: mirror committed working-store edits onto the
 * scene's {@link Sample} for persistence. The READ-half (Sample → working
 * reconcile) is now the engine's looker-3d bridge
 * (`useLooker3dAnnotationBridge`), which the engine drives off the change
 * stream.
 *
 * Transitional: `operations.ts` still mutates the working store directly, so
 * this effect carries those edits to Sample — `updateLabel` for present
 * labels, `deleteLabel` for soft-deleted ones. It retires when 3D operations
 * commit through the engine SurfaceController.
 *
 * Keyed by the scene's own stable id (the selected slice for a non-grouped 3D
 * sample, the pinned scene for a grouped modal) — never `currentSampleId`,
 * which on a 2D slice points at that slice and would bleed the cuboids onto it.
 * Stays inert until the id settles, so a load-time write never falls back to
 * the selected 2D slice.
 *
 * Loop breaking: the idempotent guard skips any push whose persistable shape
 * already equals Sample's resolved value — so a value the engine bridge just
 * reconciled in (Sample → working) is never echoed back out.
 */
export const useSync3dSample = (): void => {
  const doc = useWorkingDoc();
  const sceneId = useSceneSampleId();
  // sentinel instance while the scene id is unknown; the effect stays inert
  const sample = useSampleInstance(sceneId ?? "");

  useEffect(() => {
    if (!sceneId) {
      return;
    }

    for (const label of Object.values(doc.labelsById)) {
      if (doc.deletedIds.has(label._id)) {
        continue;
      }

      const data = build3dLabel(label);
      if (!data) {
        continue;
      }

      // Idempotent guard: skip pushes that merely echo Sample's truth.
      if (equalsNormalized(data, sample.getLabel(label.path, label._id))) {
        continue;
      }

      sample.updateLabel(label.path, data);
    }

    for (const id of doc.deletedIds) {
      const label = doc.labelsById[id];
      if (label && sample.getLabel(label.path, id)) {
        sample.deleteLabel(label.path, id);
      }
    }
  }, [doc, sample, sceneId]);
};
