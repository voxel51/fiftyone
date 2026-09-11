import type {
  useAnnotationEngine,
  useAnnotationEventBus,
  useSurfaceActions,
} from "@fiftyone/annotation";
import type { LabelData } from "@fiftyone/utilities";

export type SurfaceActions = ReturnType<typeof useSurfaceActions>;
export type AnnotationEngine = ReturnType<typeof useAnnotationEngine>;
export type AnnotationEventBus = ReturnType<typeof useAnnotationEventBus>;

/** Narrowed, non-null inputs every per-frame op needs to run. */
export interface ReadyContext {
  sample: string;
  path: string;
  fps: number;
  totalFrames: number;
}

/** Engine-backed reads scoped to the active sample + frames field. */
export interface FrameReader {
  /** This track's detection on a frame, read through the engine. */
  read(instanceId: string, frame: number): LabelData | undefined;
  /** A detection's content minus engine-owned identity (re-stamped on write). */
  content(label: LabelData): Partial<LabelData>;
  /** Every frame [1, total] this track appears on. */
  trackFrames(instanceId: string): number[];
}

/** A frame's detection paired with its number, for stable-snapshot passes. */
export type FrameDetection = { frame: number; det: LabelData };

/** Everything a per-frame op factory needs; the hook assembles it once per stream. */
export interface SurfaceOpsDeps {
  ctx: ReadyContext;
  actions: SurfaceActions;
  eventBus: AnnotationEventBus;
  engine: AnnotationEngine;
}

export const makeFrameReader = (
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

/**
 * Resolve a reader for a track's own frames field. The primary field reuses one
 * shared reader; any other field gets a reader scoped to it.
 */
export const makeReaderResolver = (
  deps: SurfaceOpsDeps,
): ((fieldPath: string) => FrameReader) => {
  const primary = makeFrameReader(deps.engine, deps.ctx);

  return (fieldPath) =>
    fieldPath === deps.ctx.path
      ? primary
      : makeFrameReader(deps.engine, { ...deps.ctx, path: fieldPath });
};

/** A track's frames with detections read up front, for a stable snapshot. */
export const snapshotTrack = (
  reader: FrameReader,
  instanceId: string,
  keep: (frame: number) => boolean,
): FrameDetection[] =>
  reader
    .trackFrames(instanceId)
    .filter(keep)
    .map((frame) => ({ frame, det: reader.read(instanceId, frame) }))
    .filter((s): s is FrameDetection => !!s.det);
