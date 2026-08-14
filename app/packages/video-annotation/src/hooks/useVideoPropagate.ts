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
import {
  type LabelData,
  LabelType,
  type SyntheticBox,
  type SyntheticPolyline,
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

/** Bbox-bearing detection fields — the only kinds propagation can interpolate. */
const isBoxFieldType = (type: LabelType): boolean =>
  type === LabelType.Detection || type === LabelType.Detections;

/** Vertex-bearing polyline fields — their vertices interpolate. */
const isPolylineFieldType = (type: LabelType): boolean =>
  type === LabelType.Polyline || type === LabelType.Polylines;

/**
 * Agent id handling linear interpolation for a field's geometry, or `null` when
 * the field has nothing this pipeline knows how to lerp (keypoints, temporal
 * detections, classifications).
 */
const linearAgentFor = (type: LabelType): string | null => {
  if (isBoxFieldType(type)) return "propagate-linear";
  if (isPolylineFieldType(type)) return "propagate-linear-polyline";
  return null;
};

/** The engine's stored polyline as the shape the polyline agent consumes. */
const toSyntheticPolyline = (label: LabelData): SyntheticPolyline => ({
  id: label._id,
  _id: label._id,
  label: (label.label as string) ?? "",
  points: label.points as SyntheticPolyline["points"],
  closed: label.closed as boolean | undefined,
  filled: label.filled as boolean | undefined,
  index: label.index as number | undefined,
  instance: label.instance as SyntheticPolyline["instance"],
  keyframe: (label.keyframe as boolean) ?? false,
  // No `propagation`: provenance was dropped from the propagation path (writing
  // `propagation: null` on promotion seeded a null baseline the next re-lerp
  // diffed as a `replace` over a server-absent path). Mirrors `toSyntheticBox`.
});

/** The engine's stored detection as the `SyntheticBox` the agents consume. */
const toSyntheticBox = (label: LabelData): SyntheticBox => ({
  id: label._id,
  _id: label._id,
  label: (label.label as string) ?? "",
  bounding_box: label.bounding_box as [number, number, number, number],
  index: label.index as number | undefined,
  instance: label.instance as SyntheticBox["instance"],
  keyframe: (label.keyframe as boolean) ?? false,
});

/**
 * The streaming SAM2 agent is registered under the broad `AnnotationAgent`
 * type but driven through its dedicated `propagate()` (which carries the frame
 * source). Narrow by that method rather than casting blind.
 */
const isSam2Agent = (
  agent: AnnotationAgent<PropagationInferenceResult>,
): agent is SAM2PropagationBrowserAgent =>
  typeof (agent as Partial<SAM2PropagationBrowserAgent>).propagate ===
  "function";

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
  /**
   * Gesture key of the edit that triggered this re-lerp. When set, the linear
   * write coalesces into that edit's undo unit. Omitted for an explicit
   * propagate run (SAM2 mints its own per-run key).
   */
  undoKey?: string;
  /**
   * Linear agent resolved from the field's label type — `propagate-linear` for
   * bboxes, `propagate-linear-polyline` for polylines.
   */
  linearAgentId?: string;
}

/**
 * SAM2 tracking runs asynchronously over the decoded ImaVid frames and streams
 * a detection per frame as inference lands. Per-frame writes can't share one
 * synchronous transaction, so they coalesce under a single minted gesture id
 * (one undo unit per propagation). No-ops without an image stream.
 */
const useSam2Propagate = () => {
  const engine = useAnnotationEngine();
  const imageStream = useImaVidImageStream();
  const resolveAgent = useResolveAgent();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagatedDetection = useApplyPropagatedDetection();
  const { setContent: setStatusContent } = useVideoAnnotationStatus();

  return useCallback(
    async (args: PropagateArgs): Promise<boolean> => {
      const { instanceId, fromFrame, toFrame, leftKeyframe, rightKeyframe } =
        args;

      if (!imageStream) {
        return false;
      }

      const agent = await resolveAgent("propagate-sam2");

      if (!agent || !isSam2Agent(agent)) {
        return false;
      }

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
          }),
        );
      render();

      // Map a 1-based frame number to its decoded bitmap, fetching + decoding
      // on demand if the LRU doesn't already hold it.
      const getFrameBitmap = async (
        frameNumber: number,
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
            applyPropagatedDetection(frameNumber, detection, {
              undoKey,
              path: args.path,
            }),
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
    },
    [
      engine,
      imageStream,
      resolveAgent,
      sampleDescriptor,
      applyPropagatedDetection,
      setStatusContent,
    ],
  );
};

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

      // Which linear agent (bbox or polyline) was resolved from the field type
      // by `useVideoPropagate`; polylines carry `points` instead of a bbox.
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

/**
 * Run object-track propagation between two keyframes of one instance,
 * dispatching to the SAM2 or linear pipeline by `method`. The seed / end
 * keyframes are read with `engine.getLabel` (the track's box at a frame) and
 * results apply through the engine writers.
 *
 * Returns `true` when work was applied. No-ops (returns `false`) without a
 * stream, on a degenerate range, or when the seed frame isn't a keyframe.
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

      // the track's own frame field — a non-primary track (e.g. a polyline)
      // re-lerps in place; defaults to the stream's primary field
      const path = pathOverride ?? `frames.${stream.labelsField}`;
      const at: FrameReader = (frame) =>
        engine.getLabel({ sample: sampleId, path, instanceId, frame });

      // Resolve the field's geometry to a linear agent — bboxes lerp their
      // `bounding_box`, polylines their vertices. Anything else (keypoints, TDs,
      // classifications) has nothing this pipeline can lerp. Gate on the schema
      // type, not the presence of geometry on the label.
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
        // SAM2 tracks a box: it converts its seed / end keyframes through
        // `toSyntheticBox` and derives point prompts from the box. Polyline
        // fields now clear the gate above (they have a linear agent), so keep
        // them out of this branch explicitly — otherwise the seed converts to an
        // undefined `bounding_box` and the prompt math reads it. Unreachable
        // today (auto-interpolate is the only caller and always asks for
        // "linear"), so fail closed now rather than crash for whoever first
        // wires SAM2 propagation to a UI.
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
