/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { BaseOverlay } from "@fiftyone/lighter";
import type { FrameLabelSnapshot, SyntheticBox } from "../SyntheticLabelStream";

/**
 * Kinds of FiftyOne labels the video surface knows how to render.
 *
 * Adding a new kind requires three changes:
 *   1. Add the kind to this union.
 *   2. Add the kind's data shape to {@link LabelDataMap}.
 *   3. Replace the kind's stub in the adapter registry with a real
 *      {@link OverlayAdapter} implementation.
 */
export type LabelKind =
  | "detection"
  | "polyline"
  | "keypoint"
  | "segmentation"
  | "heatmap"
  | "mask";

/**
 * Maps each {@link LabelKind} to its in-snapshot data type. Unimplemented
 * kinds map to `never` so the registry's typed signatures still compile;
 * replace with the real wire shape when wiring the kind up.
 */
export type LabelDataMap = {
  detection: SyntheticBox;
  polyline: never;
  keypoint: never;
  segmentation: never;
  heatmap: never;
  mask: never;
};

/**
 * Per-frame context threaded into {@link OverlayAdapter.extract}.
 */
export interface AdapterContext {
  /** Schema field the labels are read from (e.g. `predictions.detections`). */
  field: string;
  /**
   * Whether the user is currently allowed to drag/resize overlays.
   * Wired from playback paused-state by {@link useFrameOverlaySync}.
   */
  editable: boolean;
}

/**
 * Result of {@link OverlayAdapter.extract}: the data needed to call
 * `overlayFactory.create(factoryKey, props)`.
 */
export interface ExtractedOverlay {
  /** Stable identity for the overlay across frames. */
  id: string;
  /** Props forwarded as the second argument to `overlayFactory.create`. */
  props: Record<string, unknown>;
}

/**
 * Translates one kind of FiftyOne label into the Lighter overlay
 * lifecycle calls needed to render it. Used by {@link useFrameOverlaySync}
 * to dispatch per-kind without hardcoding any specific overlay type.
 *
 * @example
 * ```ts
 * const detectionAdapter: OverlayAdapter<"detection"> = {
 *   factoryKey: "detection",
 *   snapshotKey: "detections",
 *   extract: (data, ctx) => ({ id: data.id, props: { ... } }),
 *   update: (overlay, data) => { ... },
 * };
 * ```
 */
export interface OverlayAdapter<K extends LabelKind = LabelKind> {
  /** Overlay-factory key passed to `overlayFactory.create(key, props)`. */
  factoryKey: string;
  /**
   * Field on {@link FrameLabelSnapshot} this adapter's labels live under.
   * The diff loop reads `snapshot[snapshotKey]` to enumerate inputs.
   */
  snapshotKey: keyof FrameLabelSnapshot;
  /**
   * Project a raw label into the args needed to create an overlay.
   *
   * @param data - One label entry pulled from `snapshot[snapshotKey]`.
   * @param ctx - Per-diff context (field, editable, etc.).
   * @returns Overlay-construction args, or `null` to skip this label
   *   (e.g. malformed input, missing required fields).
   */
  extract(data: LabelDataMap[K], ctx: AdapterContext): ExtractedOverlay | null;
  /**
   * Apply a snapshot update to an existing overlay in place. Called
   * when the diff loop finds an overlay with a matching id already in
   * the scene. Implementations should mutate the overlay's reactive
   * state directly (e.g. `overlay.relativeBounds = ...`).
   *
   * @param overlay - The existing scene overlay (caller-narrowed to a
   *   `BaseOverlay`; implementations narrow further via `instanceof`).
   * @param data - The latest label data from the snapshot.
   */
  update(overlay: BaseOverlay, data: LabelDataMap[K]): void;
}

/**
 * Type-safe registry binding each {@link LabelKind} to its adapter.
 * `Object.values(...)` over this still erases to `OverlayAdapter<LabelKind>`
 * (the iteration site uses a narrow `as never` cast accordingly), but
 * per-key access (`overlayAdapters.detection`) stays precisely typed.
 */
export type OverlayAdapterRegistry = {
  [K in LabelKind]: OverlayAdapter<K>;
};
