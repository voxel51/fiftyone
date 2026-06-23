import {
  useAnnotationEngine,
  useAnnotationEventBus,
  useActiveSampleId,
  useSurfaceActions,
} from "@fiftyone/annotation";
import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import { frameAt } from "@fiftyone/playback";
import { useMemo } from "react";
import { instanceIdFromTrackId } from "../tracks/trackIdentity";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";

const SURFACE = "video";

export interface VideoSurfaceActions {
  /** Toggle `keyframe` on each selected track at `time`'s frame, in one undo unit. */
  markKeyframe(time: number, trackIds: readonly string[]): void;
  /**
   * Fill `targetFrames` with the source frame's box (non-keyframe). Pass
   * `undoKey` to coalesce the fill into a prior commit's undo unit (the
   * auto-extend folds into the draw that triggered it).
   */
  extendTrack(
    trackId: string,
    sourceFrame: number,
    targetFrames: number[],
    undoKey?: string
  ): void;
  /** Delete this track's box on each of `frames`. */
  trimTrack(trackId: string, frames: number[]): void;
  /** Move this track's boxes on `frames` by `delta`, keyframe/propagation intact. */
  shiftTrack(trackId: string, frames: number[], delta: number): void;
  /** Delete this track's box on every frame it appears. */
  deleteTrack(trackId: string): void;
  /** Merge track-level attributes onto every frame this track appears. */
  updateTrackAttributes(
    trackId: string,
    attributes: Record<string, unknown>
  ): void;
  /** Create a sample-level TemporalDetection; returns its id (the new instanceId). */
  createTemporalDetection(
    fieldPath: string,
    support: [number, number],
    label?: string
  ): string;
  /** Edit a sample-level TemporalDetection (e.g. `support`). */
  editTemporalDetection(
    fieldPath: string,
    detectionId: string,
    update: Partial<LabelData>
  ): void;
  /** Delete a sample-level TemporalDetection. */
  deleteTemporalDetection(fieldPath: string, detectionId: string): void;
}

/**
 * Engine-native video annotation writes — the replacement for the old
 * command-bus handlers. Every op is an {@link AnnotationEngine} transaction over
 * the registered composite store: per-frame detections route to the
 * `FrameStore` (ref carries `frame`), sample-level temporal-detections route to
 * the `SampleLabelStore` (no `frame`). The engine owns identity, undo, and
 * persistence; this layer just maps the timeline's synthetic track ids to engine
 * `instanceId`s and reads current geometry through the engine, not the stream.
 *
 * No-ops until a labels stream is published (it supplies fps / frame-count /
 * field) and a sample is active. Mount under the surface's modal scope.
 */
export const useVideoSurfaceActions = (): VideoSurfaceActions => {
  const engine = useAnnotationEngine();
  const actions = useSurfaceActions(engine, SURFACE);
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const eventBus = useAnnotationEventBus();

  return useMemo<VideoSurfaceActions>(() => {
    const path = stream ? `frames.${stream.labelsField}` : null;
    const fps = stream?.fps;
    const totalFrames = stream?.totalFrames ?? 0;

    const ready = (): boolean => !!sampleId && !!stream && !!path && !!fps;

    /** This track's detection on a frame, read through the engine. */
    const read = (instanceId: string, frame: number): LabelData | undefined =>
      engine.getLabel({
        sample: sampleId,
        path: path as string,
        instanceId,
        frame,
      });

    /** A detection's content minus engine-owned identity (re-stamped on write). */
    const content = (label: LabelData): Partial<LabelData> => {
      const { _id, instance, ...rest } = label;
      return rest;
    };

    /** Every frame [1, total] this track appears on. */
    const trackFrames = (instanceId: string): number[] => {
      const frames: number[] = [];

      for (let frame = 1; frame <= totalFrames; frame++) {
        if (read(instanceId, frame)) {
          frames.push(frame);
        }
      }

      return frames;
    };

    return {
      markKeyframe: (time, trackIds) => {
        if (!ready() || trackIds.length === 0) {
          return;
        }

        const frame = frameAt(time, fps as number, totalFrames);
        const changed: { trackId: string; instanceId: string; set: boolean }[] =
          [];

        actions.transaction(() => {
          for (const trackId of trackIds) {
            const instanceId = instanceIdFromTrackId(trackId);

            if (!instanceId) {
              continue;
            }

            const det = read(instanceId, frame);

            if (!det) {
              continue;
            }

            const set = !det.keyframe;
            const update: Partial<LabelData> = { keyframe: set };

            // promotion clears interpolation provenance — only when present, so
            // an unchanged baseline doesn't accrue a no-op `propagation: null` op
            if (set && det.propagation) {
              update.propagation = null;
            }

            actions.updateLabel(
              { path: path as string, instanceId, frame },
              update
            );
            changed.push({ trackId, instanceId, set });
          }
        });

        for (const { trackId, instanceId, set } of changed) {
          eventBus.dispatch("annotation:keyframeChanged", {
            trackId,
            instanceId,
            frame,
            kind: set ? "set" : "removed",
          });
        }
      },

      extendTrack: (trackId, sourceFrame, targetFrames, undoKey) => {
        const instanceId = instanceIdFromTrackId(trackId);

        if (!ready() || !instanceId || targetFrames.length === 0) {
          return;
        }

        const source = read(instanceId, sourceFrame);

        if (!source) {
          return;
        }

        // non-keyframe filler — a later propagate overwrites these in place
        const filler = { ...content(source), keyframe: false };

        actions.transaction(
          () => {
            for (const frame of targetFrames) {
              if (frame >= 1 && frame <= totalFrames) {
                actions.updateLabel(
                  { path: path as string, instanceId, frame },
                  filler
                );
              }
            }
          },
          undoKey ? { undoKey } : undefined
        );
      },

      trimTrack: (trackId, frames) => {
        const instanceId = instanceIdFromTrackId(trackId);

        if (!ready() || !instanceId || frames.length === 0) {
          return;
        }

        actions.transaction(() => {
          for (const frame of frames) {
            if (read(instanceId, frame)) {
              actions.deleteLabel({ path: path as string, instanceId, frame });
            }
          }
        });
      },

      shiftTrack: (trackId, frames, delta) => {
        const instanceId = instanceIdFromTrackId(trackId);

        if (!ready() || !instanceId || delta === 0 || frames.length === 0) {
          return;
        }

        // read the whole segment up front so the delete/write passes operate on
        // a stable snapshot
        const sources = frames
          .map((frame) => ({ frame, det: read(instanceId, frame) }))
          .filter((s): s is { frame: number; det: LabelData } => !!s.det);

        if (sources.length === 0) {
          return;
        }

        actions.transaction(() => {
          for (const { frame } of sources) {
            actions.deleteLabel({ path: path as string, instanceId, frame });
          }

          for (const { frame, det } of sources) {
            const target = frame + delta;

            if (target >= 1 && target <= totalFrames) {
              actions.updateLabel(
                { path: path as string, instanceId, frame: target },
                content(det)
              );
            }
          }
        });
      },

      deleteTrack: (trackId) => {
        const instanceId = instanceIdFromTrackId(trackId);

        if (!ready() || !instanceId) {
          return;
        }

        const frames = trackFrames(instanceId);

        if (frames.length === 0) {
          return;
        }

        actions.transaction(() => {
          for (const frame of frames) {
            actions.deleteLabel({ path: path as string, instanceId, frame });
          }
        });

        // let selection/editing consumers drop state bound to this track
        eventBus.dispatch("annotation:trackDeleted", { trackId });
      },

      updateTrackAttributes: (trackId, attributes) => {
        const instanceId = instanceIdFromTrackId(trackId);

        if (!ready() || !instanceId || Object.keys(attributes).length === 0) {
          return;
        }

        const frames = trackFrames(instanceId);

        actions.transaction(() => {
          for (const frame of frames) {
            actions.updateLabel(
              { path: path as string, instanceId, frame },
              attributes
            );
          }
        });
      },

      createTemporalDetection: (fieldPath, support, label) => {
        const ref: LabelRef = actions.createLabel(fieldPath, {
          _cls: "TemporalDetection",
          support,
          // mirror the server-materialized default so a tag edit has a real
          // array and the next refetch diff doesn't see an absent key
          tags: [],
          ...(label !== undefined ? { label } : {}),
        });

        return ref.instanceId;
      },

      editTemporalDetection: (fieldPath, detectionId, update) => {
        actions.updateLabel(
          { path: fieldPath, instanceId: detectionId },
          update
        );
      },

      deleteTemporalDetection: (fieldPath, detectionId) => {
        actions.deleteLabel({ path: fieldPath, instanceId: detectionId });
      },
    };
  }, [engine, actions, sampleId, stream, eventBus]);
};
