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

export interface PropagateRequest {
  instanceId: string;
  fromFrame: number;
  toFrame: number;
  mode: PropagationMethod;
  /** Gesture key that coalesces the writes into a prior edit's undo unit. */
  undoKey?: string;
  /** Frame field to propagate on; defaults to the stream's primary field. */
  path?: string;
}

/**
 * Run object-track propagation between two keyframes of one instance,
 * dispatching to the SAM2 or linear pipeline by `mode`. Returns `true` when
 * work was applied; `false` without a stream, on a degenerate range, or when
 * the seed frame is not a keyframe.
 */
export const useVideoPropagate = (): ((
  request: PropagateRequest,
) => Promise<boolean>) => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const sam2Propagate = useSam2Propagate();
  const linearPropagate = useLinearPropagate();

  return useCallback(
    async (request: PropagateRequest): Promise<boolean> => {
      const { instanceId, fromFrame, toFrame, mode, undoKey } = request;

      if (!stream || fromFrame >= toFrame) {
        return false;
      }

      // a non-primary track (e.g. a polyline) re-lerps in its own frame field
      const path = request.path ?? stream.labelsPath;

      // gate on the schema type, not the presence of geometry on the label
      const linearAgentId = linearAgentFor(engine.getLabelType(path));

      if (!linearAgentId) {
        return false;
      }

      // every frame between the keyframes is read and written, so load them
      // and keep them until the run ends
      const span = Array.from(
        { length: toFrame - fromFrame + 1 },
        (_, i) => fromFrame + i,
      );
      const release = await engine.holdFrames(sampleId, span);

      try {
        const at: FrameReader = (frame) =>
          engine.getLabel({ sample: sampleId, path, instanceId, frame });
        const leftKeyframe = at(fromFrame);

        if (!leftKeyframe?.keyframe) {
          return false;
        }

        const args: PropagateArgs = {
          instanceId,
          fromFrame,
          toFrame,
          path,
          at,
          leftKeyframe,
          rightKeyframe: at(toFrame),
          undoKey,
          linearAgentId,
        };

        if (mode === "sam2") {
          // SAM2 tracks a box; a polyline seed would convert to an undefined
          // `bounding_box`, so fail closed
          if (!isBoxFieldType(engine.getLabelType(path))) {
            return false;
          }

          return await sam2Propagate(args);
        }

        return await linearPropagate(args);
      } finally {
        release();
      }
    },
    [engine, sampleId, stream, sam2Propagate, linearPropagate],
  );
};
