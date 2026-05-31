import { useRegisterCommandHandler } from "@fiftyone/command-bus";
import { useAnnotationEventBus } from "./useAnnotationEventBus";
import {
  PropagationStatusItem,
  useFrameLabelsStream,
  useImaVidImageStream,
  useStageTemporalDetectionSupport,
  useVideoAnnotationStatus,
  type LocalDetection,
  type SyntheticBox,
} from "@fiftyone/video-annotation";
import { objectId } from "@fiftyone/utilities";
import { createElement, useCallback } from "react";
import { frameAt } from "../../../playback/src/lib/playback/utils";
import { useAgentRegistry } from "../agents/hooks/useAgentRegistry";
import {
  useApplyPropagatedDetection,
  useApplyPropagationResult,
} from "../agents/hooks/useApplyPropagationResult";
import { useSampleDescriptor } from "../agents/hooks/useSampleDescriptor";
import type { SAM2PropagationBrowserAgent } from "../agents/SAM2PropagationBrowserAgent";
import {
  AgentTaskType,
  type AnnotationAgent,
  type PropagationContext,
  type PropagationInferenceResult,
} from "../agents/types";
import {
  EditTemporalDetectionSupportCommand,
  ExtendTrackCommand,
  MarkKeyframeCommand,
  PropagateCommand,
  ShiftTrackCommand,
  TrimTrackCommand,
} from "../commands";

/** Read this track's detection on a given frame, or `undefined`. */
const detectionAt = (
  stream: { getValue: (t: number) => { detections: SyntheticBox[] } | null },
  frame: number,
  fps: number,
  trackId: string
): SyntheticBox | undefined =>
  stream.getValue((frame - 1) / fps)?.detections.find((d) => d.id === trackId);

/**
 * Project a snapshot detection into a fresh-`_id` copy for writing onto
 * another frame. Cross-frame identity (`instance` / track `index`) is
 * preserved; the `_id` is new so each frame gets its own detection doc.
 * Per-field spreads avoid writing `undefined`/`null` keys the baseline
 * lacks (which would emit spurious patch ops).
 */
const copyDetection = (
  det: SyntheticBox,
  overrides: Pick<LocalDetection, "keyframe"> &
    Partial<Pick<LocalDetection, "propagation">>
): LocalDetection => ({
  _cls: "Detection",
  _id: objectId(),
  label: det.label,
  bounding_box: det.bounding_box,
  ...(det.index !== undefined ? { index: det.index } : {}),
  ...(det.instance ? { instance: det.instance } : {}),
  ...overrides,
});

/**
 * Registers video-specific annotation command handlers. Mount inside
 * the video annotation surface's `<PlaybackProvider>` so dispatchers
 * (keybinding handlers, toolbar buttons, …) can capture the playhead
 * and selection at the moment of user intent.
 */
export const useRegisterVideoAnnotationCommandHandlers = () => {
  const stream = useFrameLabelsStream();
  const imageStream = useImaVidImageStream();
  const stageTemporalDetectionSupport = useStageTemporalDetectionSupport();
  const registry = useAgentRegistry();
  const sampleDescriptor = useSampleDescriptor();
  const applyPropagation = useApplyPropagationResult();
  const applyPropagatedDetection = useApplyPropagatedDetection();
  const { setContent: setStatusContent } = useVideoAnnotationStatus();
  const eventBus = useAnnotationEventBus();

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

          eventBus.dispatch("annotation:keyframeChanged", {
            trackId: det.id,
            instanceId: det.instance?._id ?? null,
            frame,
            kind: willBeKeyframe ? "set" : "removed",
          });
        }

        return updated;
      },
      [stream, eventBus]
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

        // SAM2 tracking runs asynchronously over the decoded ImaVid frames
        // and streams a detection per frame as inference lands. It needs the
        // image stream as a frame source; bail cleanly on surfaces that have
        // none (e.g. native video).
        if (cmd.method === "sam2") {
          if (!imageStream) return false;

          const agents = await registry.listAgents();
          const descriptor = agents.find((a) => a.id === "propagate-sam2");
          if (!descriptor) return false;
          // Registry stores agents under the broad `AnnotationAgent` type;
          // this one is driven through its dedicated `propagate()` (which
          // carries the frame source), not the generic `infer`.
          const agent =
            descriptor.agent as unknown as SAM2PropagationBrowserAgent;

          let aborted = false;
          const onStop = () => {
            aborted = true;
          };

          // Status-slot rendering. Drive the phase off `onProgress` — which
          // is monotonic and only fires once per-frame inference starts —
          // rather than the agent lifecycle, which churns
          // inferring→encoding→idle every frame (the provider re-emits
          // "encoding" per cache-miss) and would flicker the label. Until
          // the first progress tick we're in the one-time model
          // download/encode, shown as an indeterminate "Loading SAM2…".
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

          // Map a 1-based frame number to its decoded bitmap, fetching +
          // decoding on demand if the LRU doesn't already hold it. Same
          // frame→time convention the labels stream + apply path use.
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
              instanceId: cmd.instanceId,
              seedKeyframe: leftKeyframe,
              endKeyframe: rightKeyframe,
              fromFrame: cmd.fromFrame,
              toFrame: cmd.toFrame,
              videoKey: sampleDescriptor.sampleId,
              getFrameBitmap,
              onDetection: applyPropagatedDetection,
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
      [
        stream,
        imageStream,
        registry,
        sampleDescriptor,
        applyPropagation,
        applyPropagatedDetection,
        setStatusContent,
      ]
    )
  );

  useRegisterCommandHandler(
    ExtendTrackCommand,
    useCallback(
      async (cmd) => {
        if (!stream) {
          return false;
        }

        if (cmd.targetFrames.length === 0) {
          return false;
        }

        const source = detectionAt(
          stream,
          cmd.sourceFrame,
          stream.fps,
          cmd.trackId
        );
        if (!source) {
          return false;
        }

        let written = false;
        for (const frame of cmd.targetFrames) {
          if (frame < 1 || frame > stream.totalFrames) {
            continue;
          }

          // Non-keyframe filler — a later Propagate overwrites these in
          // place once the far end becomes a keyframe.
          stream.updateLabel(frame, copyDetection(source, { keyframe: false }));
          written = true;
        }

        return written;
      },
      [stream]
    )
  );

  useRegisterCommandHandler(
    TrimTrackCommand,
    useCallback(
      async (cmd) => {
        if (!stream) {
          return false;
        }

        let removed = false;
        for (const frame of cmd.frames) {
          const det = detectionAt(stream, frame, stream.fps, cmd.trackId);
          if (!det) {
            continue;
          }

          stream.deleteLabel(frame, det._id ?? det.id);
          removed = true;
        }

        return removed;
      },
      [stream]
    )
  );

  useRegisterCommandHandler(
    ShiftTrackCommand,
    useCallback(
      async (cmd) => {
        if (!stream) {
          return false;
        }

        if (cmd.delta === 0 || cmd.frames.length === 0) {
          return false;
        }

        // Read the whole segment up front, before any mutation, so the
        // delete/write passes below operate on a stable snapshot.
        const sources: Array<{ frame: number; det: SyntheticBox }> = [];
        for (const frame of cmd.frames) {
          const det = detectionAt(stream, frame, stream.fps, cmd.trackId);

          if (det) {
            sources.push({ frame, det });
          }
        }
        if (sources.length === 0) {
          return false;
        }

        // Clear the originals, then re-lay the boxes at the shifted
        // frames with fresh ids. Keyframe flags + propagation provenance
        // travel with each label so a shifted track keeps its anchors.
        for (const { frame, det } of sources) {
          stream.deleteLabel(frame, det._id ?? det.id);
        }

        for (const { frame, det } of sources) {
          const target = frame + cmd.delta;
          if (target < 1 || target > stream.totalFrames) {
            continue;
          }

          stream.updateLabel(
            target,
            copyDetection(det, {
              keyframe: det.keyframe,
              ...(det.propagation ? { propagation: det.propagation } : {}),
            })
          );
        }

        return true;
      },
      [stream]
    )
  );
};
