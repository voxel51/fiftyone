import {
  AgentTaskType,
  type AnnotationAgent,
  type PropagationContext,
  type PropagationInferenceResult,
  type SAM2PropagationBrowserAgent,
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
import { createElement, useCallback } from "react";
import { PropagationStatusItem } from "../components/PropagationStatusItem";
import {
  useApplyPropagatedDetection,
  useApplyPropagationResult,
} from "../propagation/useApplyPropagationResult";
import { useVideoAnnotationStatus } from "../state/videoAnnotationStatus";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import { useImaVidImageStream } from "../streams/imaVidImageStreamHandle";

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

/**
 * Run object-track propagation between two keyframes of one instance.
 *
 * The agents are unchanged (SAM2 streams a detection per decoded frame; linear
 * lerps the bracketing pair); only the I/O moved onto the engine — the seed /
 * end keyframes are read with `engine.getLabel` (the track's box at a frame),
 * and results apply through the engine writers. A streaming run's per-frame
 * writes can't share one synchronous transaction, so they coalesce under a
 * single minted gesture id (one undo unit per propagation).
 *
 * Returns `true` when work was applied. No-ops (returns `false`) without a
 * stream, on a degenerate range, or when the seed frame isn't a keyframe.
 */
export const useVideoPropagate = () => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const imageStream = useImaVidImageStream();
  const registry = useAgentRegistry();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagation = useApplyPropagationResult();
  const applyPropagatedDetection = useApplyPropagatedDetection();
  const { setContent: setStatusContent } = useVideoAnnotationStatus();

  return useCallback(
    async (
      instanceId: string,
      fromFrame: number,
      toFrame: number,
      method: PropagationMethod
    ): Promise<boolean> => {
      if (!stream || fromFrame >= toFrame) {
        return false;
      }

      const path = `frames.${stream.labelsField}`;
      const at = (frame: number): LabelData | undefined =>
        engine.getLabel({ sample: sampleId, path, instanceId, frame });

      const leftKeyframe = at(fromFrame);

      if (!leftKeyframe?.keyframe) {
        return false;
      }

      const rightKeyframe = at(toFrame);

      // SAM2 tracking runs asynchronously over the decoded ImaVid frames and
      // streams a detection per frame as inference lands. It needs the image
      // stream as a frame source; bail cleanly on surfaces that have none.
      if (method === "sam2") {
        if (!imageStream) {
          return false;
        }

        const agents = await registry.listAgents();
        const descriptor = agents.find((a) => a.id === "propagate-sam2");

        if (!descriptor) {
          return false;
        }

        // registry stores agents under the broad `AnnotationAgent` type; this
        // one is driven through its dedicated `propagate()` (which carries the
        // frame source), not the generic `infer`
        const agent =
          descriptor.agent as unknown as SAM2PropagationBrowserAgent;
        const undoKey = engine.mintGestureId();

        let aborted = false;
        const onStop = () => {
          aborted = true;
        };

        // Drive the phase off `onProgress` (monotonic, fires once per-frame
        // inference starts) rather than the agent lifecycle, which churns
        // inferring→encoding→idle every frame and would flicker the label.
        // Until the first progress tick we're in the one-time model download /
        // encode, shown as an indeterminate "Loading SAM2…".
        let tracking = false;
        const render = (done?: number, runTotal?: number) =>
          setStatusContent(
            createElement(PropagationStatusItem, {
              label: tracking ? "SAM2 tracking" : "Loading SAM2…",
              done,
              total: runTotal,
              onStop,
            })
          );
        render();

        // Map a 1-based frame number to its decoded bitmap, fetching + decoding
        // on demand if the LRU doesn't already hold it.
        const getFrameBitmap = async (
          frameNumber: number
        ): Promise<ImageBitmap> => {
          const time = (frameNumber - 1) / imageStream.fps;
          await imageStream.warmup(time);
          const frame = imageStream.getValue(time);

          if (!frame) {
            throw new Error(`ImaVid frame ${frameNumber} unavailable`);
          }

          return frame.bitmap;
        };

        try {
          await agent.propagate({
            instanceId,
            seedKeyframe: toSyntheticBox(leftKeyframe),
            endKeyframe: rightKeyframe
              ? toSyntheticBox(rightKeyframe)
              : undefined,
            fromFrame,
            toFrame,
            videoKey: sampleDescriptor.sampleId,
            getFrameBitmap,
            onDetection: (frameNumber, detection) =>
              applyPropagatedDetection(frameNumber, detection, { undoKey }),
            onProgress: (done, runTotal) => {
              tracking = true;
              render(done, runTotal);
            },
            shouldAbort: () => aborted,
          });
          return true;
        } catch (err) {
          console.error("[va] SAM2 propagation failed", err);
          return false;
        } finally {
          setStatusContent(null);
        }
      }

      // linear interpolation needs both endpoints to lerp between
      if (!rightKeyframe) {
        return false;
      }

      const agents = await registry.listAgents();
      const descriptor = agents.find((a) => a.id === "propagate-linear");

      if (!descriptor) {
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

      const agent =
        descriptor.agent as AnnotationAgent<PropagationInferenceResult>;
      const result = await agent.infer(context);
      applyPropagation(result);
      return true;
    },
    [
      engine,
      sampleId,
      stream,
      imageStream,
      registry,
      sampleDescriptor,
      applyPropagation,
      applyPropagatedDetection,
      setStatusContent,
    ]
  );
};
