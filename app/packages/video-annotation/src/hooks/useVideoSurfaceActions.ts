import {
  useAnnotationEngine,
  useAnnotationEventBus,
  useActiveSampleId,
  useSurfaceActions,
} from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";
import { useMemo } from "react";
import { useFrameLabelsStream } from "../streams/frameLabelsStream";
import type { ReadyContext } from "../tracks/frameReader";
import { makeTemporalDetectionOps } from "../tracks/temporalDetectionOps";
import { makeTrackIdentityOps } from "../tracks/trackIdentityOps";
import { makeTrackOps } from "../tracks/trackOps";

const SURFACE = "video";

export interface VideoSurfaceActions {
  /** Toggle `keyframe` on each selected track at `time`'s frame, in one undo unit. */
  markKeyframe(time: number, trackIds: readonly string[]): void;
  /**
   * Fill `targetFrames` with the source frame's box (non-keyframe). Pass
   * `undoKey` to coalesce the fill into a prior commit's undo unit (the
   * auto-extend folds into the draw that triggered it). `fieldPath` addresses
   * the track's own frames field (a non-primary field — e.g. a polyline — still
   * extends); defaults to the stream's primary field.
   */
  extendTrack(
    trackId: string,
    sourceFrame: number,
    targetFrames: number[],
    undoKey?: string,
    fieldPath?: string,
  ): void;
  /**
   * Delete this track's box on each of `frames`. `fieldPath` addresses the
   * track's own frames field; defaults to the stream's primary field.
   */
  trimTrack(trackId: string, frames: number[], fieldPath?: string): void;
  /**
   * Move this track's boxes on `frames` by `delta`, keyframe/propagation intact.
   * `fieldPath` addresses the track's own frames field; defaults to primary.
   */
  shiftTrack(
    trackId: string,
    frames: number[],
    delta: number,
    fieldPath?: string,
  ): void;
  /**
   * Delete this track's box on every frame it appears. `fieldPath` addresses the
   * track's own frames field (a non-primary field still deletes); defaults to the
   * stream's primary field.
   */
  deleteTrack(trackId: string, fieldPath?: string): void;
  /**
   * Merge track-level attributes onto every frame this track appears.
   * `fieldPath` addresses the track's own frames field; defaults to primary.
   */
  updateTrackAttributes(
    trackId: string,
    attributes: Record<string, unknown>,
    fieldPath?: string,
  ): void;
  /**
   * Split this track at `atFrame`: frames `>= atFrame` are re-keyed onto a
   * fresh instance (a distinct object); the original keeps frames `< atFrame`.
   * One undo unit. No-ops on a legacy/non-instance track or an empty tail.
   * `fieldPath` addresses the track's own frames field; defaults to primary.
   */
  splitTrack(trackId: string, atFrame: number, fieldPath?: string): void;
  /**
   * Merge `sourceTrackId` into `targetTrackId`: the source's frames are
   * re-keyed onto the target's instance, target-wins on overlapping frames
   * (the source box is dropped there). One undo unit. No-ops on a
   * legacy/non-instance track or a self-merge. Both tracks share `fieldPath`
   * (merge is within a field); defaults to primary.
   */
  mergeTracks(
    sourceTrackId: string,
    targetTrackId: string,
    fieldPath?: string,
  ): void;
  /** Create a sample-level TemporalDetection; returns its id (the new instanceId). */
  createTemporalDetection(
    fieldPath: string,
    support: [number, number],
    label?: string,
  ): string;
  /** Edit a sample-level TemporalDetection (e.g. `support`). */
  editTemporalDetection(
    fieldPath: string,
    detectionId: string,
    update: Partial<LabelData>,
  ): void;
  /** Delete a sample-level TemporalDetection. */
  deleteTemporalDetection(fieldPath: string, detectionId: string): void;
}

const NOOP_TRACK_OPS = {
  markKeyframe: () => {},
  extendTrack: () => {},
  trimTrack: () => {},
  shiftTrack: () => {},
  deleteTrack: () => {},
  updateTrackAttributes: () => {},
  splitTrack: () => {},
  mergeTracks: () => {},
};

/**
 * Engine-native video annotation writes: per-frame ops route to the frame
 * store, sample-level temporal detections to the sample store, all as engine
 * transactions. Per-frame ops no-op until a labels stream and a sample are
 * active.
 */
export const useVideoSurfaceActions = (): VideoSurfaceActions => {
  const engine = useAnnotationEngine();
  const sampleId = useActiveSampleId();
  const actions = useSurfaceActions(engine, SURFACE, sampleId);
  const stream = useFrameLabelsStream();
  const eventBus = useAnnotationEventBus();

  return useMemo<VideoSurfaceActions>(() => {
    const ctx: ReadyContext | null =
      sampleId && stream && stream.fps
        ? {
            sample: sampleId,
            path: stream.labelsPath,
            fps: stream.fps,
            totalFrames: stream.totalFrames ?? 0,
          }
        : null;

    const temporal = makeTemporalDetectionOps(actions);

    if (!ctx) {
      return { ...NOOP_TRACK_OPS, ...temporal };
    }

    const deps = { ctx, actions, eventBus, engine };

    return {
      ...makeTrackOps(deps),
      ...makeTrackIdentityOps(deps),
      ...temporal,
    };
  }, [engine, actions, sampleId, stream, eventBus]);
};
