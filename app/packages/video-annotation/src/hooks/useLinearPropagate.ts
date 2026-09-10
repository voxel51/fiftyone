import {
  AgentTaskType,
  type PropagationContext,
  useSampleDescriptor,
} from "@fiftyone/annotation";
import { useCallback } from "react";
import type { PropagateArgs } from "../propagation/propagateArgs";
import {
  toSyntheticBox,
  toSyntheticPolyline,
} from "../propagation/propagationShapes";
import { useApplyPropagationResult } from "../propagation/useApplyPropagationResult";
import { useResolveAgent } from "./useResolveAgent";

/**
 * Linear interpolation lerps the bracketing keyframe pair in one synchronous
 * inference call. No-ops without an end keyframe to lerp toward.
 */
export const useLinearPropagate = () => {
  const resolveAgent = useResolveAgent();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagation = useApplyPropagationResult();

  return useCallback(
    async (args: PropagateArgs): Promise<boolean> => {
      const {
        instanceId,
        fromFrame,
        toFrame,
        leftKeyframe,
        rightKeyframe,
        undoKey,
      } = args;

      if (!rightKeyframe) {
        return false;
      }

      const agentId = args.linearAgentId ?? "propagate-linear";
      const agent = await resolveAgent(agentId);

      if (!agent) {
        return false;
      }

      const toKeyframe =
        agentId === "propagate-linear-polyline"
          ? toSyntheticPolyline
          : toSyntheticBox;

      const context: PropagationContext = {
        sampleDescriptor,
        taskType: AgentTaskType.PROPAGATE,
        instanceId,
        fromFrame,
        toFrame,
        parentKeyframes: [toKeyframe(leftKeyframe), toKeyframe(rightKeyframe)],
      };

      const result = await agent.infer(context);
      applyPropagation(result, { undoKey, path: args.path });
      return true;
    },
    [resolveAgent, sampleDescriptor, applyPropagation],
  );
};
