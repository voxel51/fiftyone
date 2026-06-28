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
  /** Merge track-level attributes onto every frame this track appears. */
  updateTrackAttributes(
    trackId: string,
    attributes: Record<string, unknown>,
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

type SurfaceActions = ReturnType<typeof useSurfaceActions>;
type AnnotationEngine = ReturnType<typeof useAnnotationEngine>;
type AnnotationEventBus = ReturnType<typeof useAnnotationEventBus>;

/** Narrowed, non-null inputs every per-frame op needs to run. */
interface ReadyContext {
  sample: string;
  path: string;
  fps: number;
  totalFrames: number;
}

/** Engine-backed reads scoped to the active sample + frames field. */
interface FrameReader {
  /** This track's detection on a frame, read through the engine. */
  read(instanceId: string, frame: number): LabelData | undefined;
  /** A detection's content minus engine-owned identity (re-stamped on write). */
  content(label: LabelData): Partial<LabelData>;
  /** Every frame [1, total] this track appears on. */
  trackFrames(instanceId: string): number[];
}

const makeFrameReader = (
  engine: AnnotationEngine,
  ctx: ReadyContext,
): FrameReader => {
  const read = (instanceId: string, frame: number): LabelData | undefined =>
    engine.getLabel({
      sample: ctx.sample,
      path: ctx.path,
      instanceId,
      frame,
    });

  const content = (label: LabelData): Partial<LabelData> => {
    const { _id, instance, ...rest } = label;
    return rest;
  };

  const trackFrames = (instanceId: string): number[] => {
    const frames: number[] = [];

    for (let frame = 1; frame <= ctx.totalFrames; frame++) {
      if (read(instanceId, frame)) {
        frames.push(frame);
      }
    }

    return frames;
  };

  return { read, content, trackFrames };
};

/** Per-frame track ops (keyframes, fills, trims, shifts, deletes, attributes). */
const makeTrackOps = (
  ctx: ReadyContext,
  actions: SurfaceActions,
  eventBus: AnnotationEventBus,
  reader: FrameReader,
  engine: AnnotationEngine,
) => {
  const { path, fps, totalFrames } = ctx;
  const { read, content, trackFrames } = reader;

  // A track may live on a non-primary frame field; resolve a reader scoped to
  // its own path. The shared `reader` is the primary-field fast path.
  const readerFor = (fieldPath: string): FrameReader =>
    fieldPath === path
      ? reader
      : makeFrameReader(engine, { ...ctx, path: fieldPath });

  const markKeyframe = (time: number, trackIds: readonly string[]): void => {
    if (trackIds.length === 0) {
      return;
    }

    const frame = frameAt(time, fps, totalFrames);
    const changed: { trackId: string; instanceId: string; set: boolean }[] = [];

    // One gesture key for the toggle AND the auto-interpolate re-lerp it
    // triggers, so a single Ctrl-Z reverts both as one unit.
    const undoKey = engine.mintGestureId();

    actions.transaction(
      () => {
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

          actions.updateLabel({ path, instanceId, frame }, update);
          changed.push({ trackId, instanceId, set });
        }
      },
      { undoKey },
    );

    for (const { trackId, instanceId, set } of changed) {
      eventBus.dispatch("annotation:keyframeChanged", {
        trackId,
        instanceId,
        frame,
        kind: set ? "set" : "removed",
        undoKey,
      });
    }
  };

  const extendTrack = (
    trackId: string,
    sourceFrame: number,
    targetFrames: number[],
    undoKey?: string,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || targetFrames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);
    const source = r.read(instanceId, sourceFrame);

    if (!source) {
      return;
    }

    // non-keyframe filler — a later propagate overwrites these in place
    const filler = { ...r.content(source), keyframe: false };

    actions.transaction(
      () => {
        for (const frame of targetFrames) {
          if (frame >= 1 && frame <= totalFrames) {
            actions.updateLabel({ path: fieldPath, instanceId, frame }, filler);
          }
        }
      },
      undoKey ? { undoKey } : undefined,
    );
  };

  const trimTrack = (
    trackId: string,
    frames: number[],
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || frames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);

    actions.transaction(() => {
      for (const frame of frames) {
        if (r.read(instanceId, frame)) {
          actions.deleteLabel({ path: fieldPath, instanceId, frame });
        }
      }
    });
  };

  const shiftTrack = (
    trackId: string,
    frames: number[],
    delta: number,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || delta === 0 || frames.length === 0) {
      return;
    }

    const r = readerFor(fieldPath);

    // read the whole segment up front so the delete/write passes operate on
    // a stable snapshot
    const sources = frames
      .map((frame) => ({ frame, det: r.read(instanceId, frame) }))
      .filter((s): s is { frame: number; det: LabelData } => !!s.det);

    if (sources.length === 0) {
      return;
    }

    actions.transaction(() => {
      for (const { frame } of sources) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
      }

      for (const { frame, det } of sources) {
        const target = frame + delta;

        if (target >= 1 && target <= totalFrames) {
          actions.updateLabel(
            { path: fieldPath, instanceId, frame: target },
            r.content(det),
          );
        }
      }
    });
  };

  const deleteTrack = (trackId: string, fieldPath: string = path): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId) {
      return;
    }

    const frames = readerFor(fieldPath).trackFrames(instanceId);

    if (frames.length === 0) {
      return;
    }

    actions.transaction(() => {
      for (const frame of frames) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
      }
    });

    // let selection/editing consumers drop state bound to this track
    eventBus.dispatch("annotation:trackDeleted", { trackId });
  };

  const updateTrackAttributes = (
    trackId: string,
    attributes: Record<string, unknown>,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId || Object.keys(attributes).length === 0) {
      return;
    }

    const frames = trackFrames(instanceId);

    actions.transaction(() => {
      for (const frame of frames) {
        actions.updateLabel({ path, instanceId, frame }, attributes);
      }
    });
  };

  return {
    markKeyframe,
    extendTrack,
    trimTrack,
    shiftTrack,
    deleteTrack,
    updateTrackAttributes,
  };
};

/** A frame's detection paired with its number, for stable-snapshot passes. */
type FrameDetection = { frame: number; det: LabelData };

/**
 * Instance-level track identity rewrites (split / merge). Each re-keys frames
 * by composing `deleteLabel` (old instance) + `updateLabel` (new instance,
 * born under the target id) inside one transaction — one undo unit. The engine
 * refuses identity edits via `updateLabel`, so re-keying is delete + recreate;
 * the per-frame doc `_id` is re-minted (it links nothing — `instance._id` is
 * the track key).
 */
const makeTrackIdentityOps = (
  ctx: ReadyContext,
  actions: SurfaceActions,
  eventBus: AnnotationEventBus,
  reader: FrameReader,
  engine: AnnotationEngine,
) => {
  const { path } = ctx;

  // A track may live on a non-primary frame field; resolve a reader scoped to
  // its own path. The shared `reader` is the primary-field fast path.
  const readerFor = (fieldPath: string): FrameReader =>
    fieldPath === path
      ? reader
      : makeFrameReader(engine, { ...ctx, path: fieldPath });

  /** A track's frames with detections read up front, for a stable snapshot. */
  const snapshot = (
    r: FrameReader,
    instanceId: string,
    keep: (frame: number) => boolean,
  ): FrameDetection[] =>
    r
      .trackFrames(instanceId)
      .filter(keep)
      .map((frame) => ({ frame, det: r.read(instanceId, frame) }))
      .filter((s): s is FrameDetection => !!s.det);

  const splitTrack = (
    trackId: string,
    atFrame: number,
    fieldPath: string = path,
  ): void => {
    const instanceId = instanceIdFromTrackId(trackId);

    if (!instanceId) {
      return;
    }

    const r = readerFor(fieldPath);
    const tail = snapshot(r, instanceId, (frame) => frame >= atFrame);

    if (tail.length === 0) {
      return;
    }

    const newInstanceId = engine.mintInstanceId();

    actions.transaction(() => {
      for (const { frame, det } of tail) {
        actions.deleteLabel({ path: fieldPath, instanceId, frame });
        actions.updateLabel(
          { path: fieldPath, instanceId: newInstanceId, frame },
          r.content(det),
        );
      }
    });

    eventBus.dispatch("annotation:trackSplit", {
      trackId,
      instanceId,
      newInstanceId,
      atFrame,
    });
  };

  const mergeTracks = (
    sourceTrackId: string,
    targetTrackId: string,
    fieldPath: string = path,
  ): void => {
    const sourceInstanceId = instanceIdFromTrackId(sourceTrackId);
    const targetInstanceId = instanceIdFromTrackId(targetTrackId);

    if (
      !sourceInstanceId ||
      !targetInstanceId ||
      sourceInstanceId === targetInstanceId
    ) {
      return;
    }

    const r = readerFor(fieldPath);
    const occupied = new Set(r.trackFrames(targetInstanceId));
    const sources = snapshot(r, sourceInstanceId, () => true);

    if (sources.length === 0) {
      return;
    }

    actions.transaction(() => {
      for (const { frame, det } of sources) {
        // target-wins: always drop the source box; only re-stamp onto the
        // target where it has no box on this frame
        actions.deleteLabel({
          path: fieldPath,
          instanceId: sourceInstanceId,
          frame,
        });

        if (!occupied.has(frame)) {
          actions.updateLabel(
            { path: fieldPath, instanceId: targetInstanceId, frame },
            r.content(det),
          );
        }
      }
    });

    eventBus.dispatch("annotation:trackMerged", {
      sourceTrackId,
      targetTrackId,
      sourceInstanceId,
      targetInstanceId,
    });
  };

  return { splitTrack, mergeTracks };
};

/** Sample-level TemporalDetection ops (no frame on the ref). */
const makeTemporalDetectionOps = (actions: SurfaceActions) => {
  const createTemporalDetection = (
    fieldPath: string,
    support: [number, number],
    label?: string,
  ): string => {
    const ref: LabelRef = actions.createLabel(fieldPath, {
      _cls: "TemporalDetection",
      support,
      // mirror the server-materialized default so a tag edit has a real
      // array and the next refetch diff doesn't see an absent key
      tags: [],
      ...(label !== undefined ? { label } : {}),
    });

    return ref.instanceId;
  };

  const editTemporalDetection = (
    fieldPath: string,
    detectionId: string,
    update: Partial<LabelData>,
  ): void => {
    actions.updateLabel({ path: fieldPath, instanceId: detectionId }, update);
  };

  const deleteTemporalDetection = (
    fieldPath: string,
    detectionId: string,
  ): void => {
    actions.deleteLabel({ path: fieldPath, instanceId: detectionId });
  };

  return {
    createTemporalDetection,
    editTemporalDetection,
    deleteTemporalDetection,
  };
};

/**
 * Engine-native video annotation writes. Every op is an
 * {@link AnnotationEngine} transaction over the registered composite store:
 * per-frame detections route to the `FrameStore` (ref carries `frame`),
 * sample-level temporal-detections route to the `SampleLabelStore` (no
 * `frame`). The engine owns identity, undo, and persistence; this layer maps
 * the timeline's synthetic track ids to engine `instanceId`s and reads current
 * geometry through the engine, not the stream.
 *
 * Per-frame ops no-op until a labels stream is published (it supplies fps /
 * frame-count / field) and a sample is active. Mount under the surface's modal
 * scope.
 */
export const useVideoSurfaceActions = (): VideoSurfaceActions => {
  const engine = useAnnotationEngine();
  const actions = useSurfaceActions(engine, SURFACE);
  const sampleId = useActiveSampleId();
  const stream = useFrameLabelsStream();
  const eventBus = useAnnotationEventBus();

  return useMemo<VideoSurfaceActions>(() => {
    const ctx: ReadyContext | null =
      sampleId && stream && stream.fps
        ? {
            sample: sampleId,
            path: `frames.${stream.labelsField}`,
            fps: stream.fps,
            totalFrames: stream.totalFrames ?? 0,
          }
        : null;

    const temporal = makeTemporalDetectionOps(actions);

    if (!ctx) {
      // TD ops are sample-level and stream-independent; per-frame track ops
      // no-op until the stream + sample are ready.
      return {
        markKeyframe: () => {},
        extendTrack: () => {},
        trimTrack: () => {},
        shiftTrack: () => {},
        deleteTrack: () => {},
        updateTrackAttributes: () => {},
        splitTrack: () => {},
        mergeTracks: () => {},
        ...temporal,
      };
    }

    const reader = makeFrameReader(engine, ctx);
    const track = makeTrackOps(ctx, actions, eventBus, reader, engine);
    const identity = makeTrackIdentityOps(
      ctx,
      actions,
      eventBus,
      reader,
      engine,
    );

    return { ...track, ...identity, ...temporal };
  }, [engine, actions, sampleId, stream, eventBus]);
};
