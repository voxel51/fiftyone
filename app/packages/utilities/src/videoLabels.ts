/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

/**
 * Leaf types for the video-annotation label / per-frame stream domain. They
 * live here — below both `@fiftyone/annotation` and `@fiftyone/video-annotation`
 * — so the two packages can share them without importing each other. Pure type
 * shapes with no React / state deps.
 */

/** ObjectId hex string. */
export type ObjectIdHex = string;

export type PropagationMethod = "linear" | "sam2" | "sam2-video-browser";

/** Provenance written on labels created by a propagation run. */
export interface PropagationBlob {
  method: PropagationMethod;
  run_id: ObjectIdHex;
  /**
   * Source keyframes' `_id`s. Two for a bracketed run (linear interp,
   * or SAM2 between two keyframes); one for a SAM2 forward run that tracks
   * from a single seed keyframe to the end of the clip.
   */
  parent_keyframes: [ObjectIdHex, ...ObjectIdHex[]];
}

export interface SyntheticBox {
  id: string;
  /**
   * Real MongoDB `_id` of the source detection when one exists. The
   * overlay-facing {@link id} is synthesized from the track index for
   * tracked detections (so cross-frame identity for color/highlight
   * matches the timeline track), but persistence needs the original
   * `_id` to upsert the right element in the baseline detections list.
   * Undefined for freshly-drawn boxes that haven't been persisted yet.
   */
  _id?: string;
  label: string;
  /** Normalized [x, y, w, h] in [0, 1]. */
  bounding_box: [number, number, number, number];
  /**
   * FiftyOne track index, when present. Carried so downstream color-
   * mapping can use `COLOR_BY.INSTANCE`'s `${label}-${index}-...` hash
   * (otherwise instance mode would collapse tracked detections of the
   * same class to one color).
   */
  index?: number;
  /**
   * Mirrors {@link BaseLabel.instance} from `@fiftyone/looker`. Used as
   * the fallback `COLOR_BY.INSTANCE` hash seed for untracked detections,
   * and as a stable instance id for the synthetic stream (which has no
   * numeric index).
   */
  instance?: { _cls: "Instance"; _id?: string };
  /** `true` for user-authored / propagation source; `false` for interpolated. */
  keyframe: boolean;
  /** Provenance for propagation-created labels; `null` for keyframes. */
  propagation: PropagationBlob | null;
}

export interface FrameLabelSnapshot {
  frameNumber: number;
  detections: SyntheticBox[];
}

export interface RawDetection {
  _id?: string;
  id?: string;
  index?: number;
  label?: string;
  bounding_box?: [number, number, number, number];
  instance?: { _cls: "Instance"; _id?: string } | null;
  keyframe?: boolean;
  propagation?: PropagationBlob | null;
}

export interface RawDetectionsField {
  detections?: RawDetection[];
}

/**
 * Shape callers pass to {@link VideoFrameLabelsStream.updateLabel}.
 * Lines up with the `Detection` wire format — `bounding_box` is required
 * since a Detection with no bbox is meaningless for a video overlay.
 */
export interface LocalDetection {
  _cls?: "Detection";
  _id?: string;
  id?: string;
  index?: number;
  label?: string;
  bounding_box: [number, number, number, number];
  instance?: { _cls: "Instance"; _id?: string } | null;
  /**
   * Auto-promote-on-edit: callers handling user-initiated edits (draw,
   * drag, resize) should pass `keyframe: true` so an interpolated label
   * is promoted to a keyframe on touch. Omit to preserve the existing
   * value through `updateLabel`'s shallow merge.
   */
  keyframe?: boolean;
  /**
   * Propagation provenance. User edits clear this (`null`); leave
   * undefined to preserve the existing value through the shallow merge.
   */
  propagation?: PropagationBlob | null;
}
