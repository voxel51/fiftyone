import {
  AgentTaskType,
  type AnnotationAgent,
  type PropagationContext,
  type PropagationInferenceResult,
  useActiveSampleId,
  useAgentRegistry,
  useAnnotationEngine,
  useSampleDescriptor,
} from "@fiftyone/annotation";
import type {
  LabelData,
  PropagationBlob,
  SyntheticBox,
} from "@fiftyone/utilities";
import { useCallback } from "react";
import { useApplyPropagationResult } from "../propagation/useApplyPropagationResult";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

/**
 * Method discriminator for the propagation dispatcher. Only `"linear"` is
 * implemented in-browser today; the union is kept open so a future
 * server-backed tracker (e.g. `"sam2"`) can slot in without a signature
 * change. Historical labels persisted in user databases may carry
 * `propagation.method: "sam2"` from the prior browser SAM2 hack — readers
 * must tolerate that value even though no in-browser path produces it now.
 */
export type PropagationMethod = "sam2" | "linear";

/** The engine's stored detection as the `SyntheticBox` the agents consume. */
const toSyntheticBox = (label: LabelData): SyntheticBox => ({
  id: label._id,
  _id: label._id,
  label: (label.label as string) ?? "",
  bounding_box: label.bounding_box as [number, number, number, number],
  index: label.index as number | undefined,
  instance: label.instance as SyntheticBox["instance"],
  keyframe: (label.keyframe as boolean) ?? false,
  propagation: (label.propagation as PropagationBlob | null) ?? null,
});

/** Resolves a registered agent by id, or `null` when absent. */
const useResolveAgent = () => {
  const registry = useAgentRegistry();

  return useCallback(
    async (
      id: string,
    ): Promise<AnnotationAgent<PropagationInferenceResult> | null> => {
      const agents = await registry.listAgents();
      const descriptor = agents.find((a) => a.id === id);

      return descriptor
        ? (descriptor.agent as AnnotationAgent<PropagationInferenceResult>)
        : null;
    },
    [registry],
  );
};

/** A track's box at a frame, read through the engine. */
type FrameReader = (frame: number) => LabelData | undefined;

interface PropagateArgs {
  instanceId: string;
  fromFrame: number;
  toFrame: number;
  /** Frames-field path of the active stream. */
  path: string;
  /** Reads the track's box at a frame through the engine. */
  at: FrameReader;
  /** The seed keyframe (already verified present + keyframe). */
  leftKeyframe: LabelData;
  /** The end keyframe, if any. */
  rightKeyframe: LabelData | undefined;
}

/**
 * Linear interpolation lerps the bracketing keyframe pair in one synchronous
 * inference call. No-ops without an end keyframe to lerp toward.
 */
const useLinearPropagate = () => {
  const resolveAgent = useResolveAgent();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagation = useApplyPropagationResult();

  return useCallback(
    async (args: PropagateArgs): Promise<boolean> => {
      const { instanceId, fromFrame, toFrame, leftKeyframe, rightKeyframe } =
        args;

      if (!rightKeyframe) {
        return false;
      }

      const agent = await resolveAgent("propagate-linear");

      if (!agent) {
        return false;
      }

      const context: PropagationContext = {
        sampleDescriptor,
        taskType: AgentTaskType.PROPAGATE,
        instanceId,
        fromFrame,
        toFrame,
        parentKeyframes: [
          toSyntheticBox(leftKeyframe),
          toSyntheticBox(rightKeyframe),
        ],
      };

      const result = await agent.infer(context);
      applyPropagation(result);
      return true;
    },
    [resolveAgent, sampleDescriptor, applyPropagation],
  );
};

/**
 * Run object-track propagation between two keyframes of one instance,
 * dispatching by `method`. The seed / end keyframes are read with
 * `engine.getLabel` (the track's box at a frame) and results apply through
 * the engine writers.
 *
 * Today only `"linear"` resolves to a real backend; the `method`-based
 * dispatch shell is preserved so a future server-backed tracker can be
 * added behind a new branch without changing call sites.
 *
 * Returns `true` when work was applied. No-ops (returns `false`) without a
 * stream, on a degenerate range, or when the seed frame isn't a keyframe.
 */
export const useVideoPropagate = () => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const linearPropagate = useLinearPropagate();

  return useCallback(
    async (
      instanceId: string,
      fromFrame: number,
      toFrame: number,
      // Dispatcher discriminator; only `"linear"` is implemented today.
      // Kept in the signature so call sites and a future server-backed
      // tracker branch don't need a signature change when added.
      _method: PropagationMethod,
    ): Promise<boolean> => {
      if (!stream || fromFrame >= toFrame) {
        return false;
      }

      const path = `frames.${stream.labelsField}`;
      const at: FrameReader = (frame) =>
        engine.getLabel({ sample: sampleId, path, instanceId, frame });

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
      };

      return linearPropagate(args);
    },
    [engine, sampleId, stream, linearPropagate],
  );
};
