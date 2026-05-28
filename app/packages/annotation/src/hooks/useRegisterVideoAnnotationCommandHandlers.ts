import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import {
  useFrameLabelsStream,
  useStageTemporalDetectionSupport,
  type LocalDetection,
} from "@fiftyone/video-annotation";
import { useCallback } from "react";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import { useAgentRegistry } from "../agents/hooks/useAgentRegistry";
import { useApplyPropagationResult } from "../agents/hooks/useApplyPropagationResult";
import { useSampleDescriptor } from "../agents/hooks/useSampleDescriptor";
import {
  AgentTaskType,
  type AnnotationAgent,
  type PropagationContext,
  type PropagationInferenceResult,
} from "../agents/types";
import {
  EditTemporalDetectionSupportCommand,
  MarkKeyframeCommand,
  PropagateCommand,
} from "../commands";

/**
 * Registers video-specific annotation command handlers. Mount inside
 * the video annotation surface's `<PlaybackProvider>` so dispatchers
 * (keybinding handlers, toolbar buttons, …) can capture the playhead
 * and selection at the moment of user intent.
 */
export const useRegisterVideoAnnotationCommandHandlers = () => {
  const stream = useFrameLabelsStream();
  const stageTemporalDetectionSupport = useStageTemporalDetectionSupport();
  const registry = useAgentRegistry();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagation = useApplyPropagationResult();

  useRegisterCommandHandler(
    EditTemporalDetectionSupportCommand,
    useCallback(
      async (cmd) => {
        stageTemporalDetectionSupport(cmd.fieldPath, cmd.detectionId, [
          cmd.support[0],
          cmd.support[1],
        ]);
        return true;
      },
      [stageTemporalDetectionSupport]
    )
  );

  useRegisterCommandHandler(
    MarkKeyframeCommand,
    useCallback(
      async (cmd) => {
        if (!stream) return false;
        if (cmd.detectionIds.length === 0) return false;

        const snapshot = stream.getValue(cmd.time);
        if (!snapshot) return false;

        const frame = frameAt(cmd.time, stream.fps, stream.totalFrames);

        let updated = false;
        for (const id of cmd.detectionIds) {
          const det = snapshot.detections.find((d) => d.id === id);
          if (!det) continue;

          const willBeKeyframe = !det.keyframe;

          // Minimal update — `bounding_box` is required by LocalDetection
          // but matches the existing cache entry, so the structural diff
          // sees only the fields that actually changed. Avoid setting
          // `instance` / `propagation` / `label` / `index` explicitly:
          // updateLabel's shallow merge preserves them from the cache,
          // and writing them as nulls would emit spurious `add ...
          // value: null` patch ops against baselines that lack the keys.
          const update: LocalDetection = {
            _cls: "Detection",
            _id: det._id ?? id,
            bounding_box: det.bounding_box,
            keyframe: willBeKeyframe,
          };

          // Promotion to keyframe semantically clears propagation. Only
          // write the field when there's something to clear — otherwise
          // we'd emit a no-op `add propagation: null` patch op.
          if (willBeKeyframe && det.propagation) {
            update.propagation = null;
          }

          stream.updateLabel(frame, update);
          updated = true;
        }

        return updated;
      },
      [stream]
    )
  );

  useRegisterCommandHandler(
    PropagateCommand,
    useCallback(
      async (cmd) => {
        if (!stream) return false;
        if (cmd.fromFrame >= cmd.toFrame) return false;

        const fromTime = (cmd.fromFrame - 1) / stream.fps;
        const toTime = (cmd.toFrame - 1) / stream.fps;
        const fromSnapshot = stream.getValue(fromTime);
        const toSnapshot = stream.getValue(toTime);
        if (!fromSnapshot || !toSnapshot) return false;

        const matchesInstance = (d: {
          instance?: { _cls: "Instance"; _id?: string };
          keyframe: boolean;
        }): boolean =>
          d.keyframe === true && d.instance?._id === cmd.instanceId;

        const leftKeyframe = fromSnapshot.detections.find(matchesInstance);
        const rightKeyframe = toSnapshot.detections.find(matchesInstance);
        if (!leftKeyframe || !rightKeyframe) return false;

        const agentId = `propagate-${cmd.method}`;
        const agents = await registry.listAgents();
        const descriptor = agents.find((a) => a.id === agentId);
        if (!descriptor) return false;

        const context: PropagationContext = {
          sampleDescriptor,
          taskType: AgentTaskType.PROPAGATE,
          instanceId: cmd.instanceId,
          fromFrame: cmd.fromFrame,
          toFrame: cmd.toFrame,
          parentKeyframes: [leftKeyframe, rightKeyframe],
        };

        // Registry stores agents under the broad `InferenceResultProxy`
        // type; narrow to the propagation agent's specific result type so
        // the downstream apply hook is typed end-to-end.
        const agent =
          descriptor.agent as AnnotationAgent<PropagationInferenceResult>;
        const result = await agent.infer(context);
        applyPropagation(result);
        return true;
      },
      [stream, registry, sampleDescriptor, applyPropagation]
    )
  );
};
