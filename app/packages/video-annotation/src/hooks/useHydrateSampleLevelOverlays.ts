import {
  type SampleLabelStore,
  useAnnotationEngine,
  useEngineSelector,
} from "@fiftyone/annotation";
import { type MutableRefObject, useEffect } from "react";
import { useVisibleLabelSchemas } from "../state/accessors";

/**
 * Re-announce the sample-level backing once a sample-level label becomes
 * resolvable, so the Lighter bridge mounts its overlay and the temporal view
 * refreshes its presence cache. The signature folds in the resolved label
 * type, so the resync fires when the data lands and again when the type
 * settles.
 */
export const useHydrateSampleLevelOverlays = (
  engine: ReturnType<typeof useAnnotationEngine>,
  sampleId: string,
  sampleLevelRef: MutableRefObject<SampleLabelStore | null>,
  pathsOverride?: ReadonlySet<string>,
): void => {
  // Called unconditionally to keep hook order stable; the override wins.
  const annotationVisible = useVisibleLabelSchemas();
  const visible = pathsOverride ?? annotationVisible;

  // Frame fields are excluded because the FrameStore announces those itself;
  // temporal detections stay in so the presence cache refreshes
  const signature = useEngineSelector(engine, (reads) => {
    return [...visible]
      .filter((path) => !path.startsWith("frames."))
      .sort()
      .map((path) => {
        const ids = reads
          .listLabels({ sample: sampleId, path })
          .map((label) => label._id)
          .join(",");

        return `${path}:${reads.getLabelType(path)}:${ids}`;
      })
      .join("|");
  });

  useEffect(() => {
    if (!signature) {
      return;
    }

    sampleLevelRef.current?.resync();
  }, [signature, sampleLevelRef]);
};
