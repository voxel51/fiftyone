import { useActiveSampleId, useAnnotationEngine } from "@fiftyone/annotation";
import { useCallback } from "react";
import type { FrameReader, PropagateArgs } from "../propagation/propagateArgs";
import {
  isBoxFieldType,
  linearAgentFor,
} from "../propagation/propagationShapes";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useLinearPropagate } from "./useLinearPropagate";
import { useSam2Propagate } from "./useSam2Propagate";

export type PropagationMethod = "sam2" | "linear";

/**
 * Run object-track propagation between two keyframes of one instance,
 * dispatching to the SAM2 or linear pipeline by `method`. Returns `true` when
 * work was applied; `false` without a stream, on a degenerate range, or when
 * the seed frame is not a keyframe.
 */
export const useVideoPropagate = () => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const sam2Propagate = useSam2Propagate();
  const linearPropagate = useLinearPropagate();

  return useCallback(
    async (
      instanceId: string,
      fromFrame: number,
      toFrame: number,
      method: PropagationMethod,
      undoKey?: string,
      pathOverride?: string,
    ): Promise<boolean> => {
      if (!stream || fromFrame >= toFrame) {
        return false;
      }

      // a non-primary track (e.g. a polyline) re-lerps in its own frame field
      const path = pathOverride ?? stream.labelsPath;
      const at: FrameReader = (frame) =>
        engine.getLabel({ sample: sampleId, path, instanceId, frame });

      // gate on the schema type, not the presence of geometry on the label
      const linearAgentId = linearAgentFor(engine.getLabelType(path));

      if (!linearAgentId) {
        return false;
      }

      const leftKeyframe = at(fromFrame);

      if (!leftKeyframe?.keyframe) {
        return false;
      }

      const rightKeyframe = at(toFrame);
      const args: PropagateArgs = {
        instanceId,
        fromFrame,
        toFrame,
        path,
        at,
        leftKeyframe,
        rightKeyframe,
        undoKey,
        linearAgentId,
      };

      if (method === "sam2") {
        // SAM2 tracks a box; a polyline seed would convert to an undefined
        // `bounding_box`, so fail closed
        if (!isBoxFieldType(engine.getLabelType(path))) {
          return false;
        }

        return sam2Propagate(args);
      }

      return linearPropagate(args);
    },
    [engine, sampleId, stream, sam2Propagate, linearPropagate],
  );
};
