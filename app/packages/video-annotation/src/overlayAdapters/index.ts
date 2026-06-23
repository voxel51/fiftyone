/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { detectionAdapter } from "./detection";
import type {
  LabelKind,
  OverlayAdapter,
  OverlayAdapterRegistry,
} from "./types";

export type {
  AdapterContext,
  ExtractedOverlay,
  LabelDataMap,
  LabelKind,
  OverlayAdapter,
  OverlayAdapterRegistry,
} from "./types";

/**
 * Build a stub adapter for a {@link LabelKind} that hasn't been wired
 * yet. Stub entries surface the missing kind at the call site (rather
 * than silently dropping its labels) and document at registry-read
 * time which kinds the surface knows about but hasn't implemented.
 *
 * Replace the stub with a real adapter file when implementing the kind.
 *
 * @param kind - The unimplemented label kind, used in error messages.
 */
const notImplemented = <K extends LabelKind>(kind: K): OverlayAdapter<K> =>
  ({
    factoryKey: kind,
    // No snapshot field is named for the kind, so the diff loop reads
    // `undefined` and skips the adapter (the consumer keys off `snapshotKey`).
    snapshotKey: kind as never,
    extract() {
      throw new Error(`Overlay adapter for "${kind}" is not implemented`);
    },
    update() {
      throw new Error(`Overlay adapter for "${kind}" is not implemented`);
    },
  } as OverlayAdapter<K>);

/**
 * Registry mapping each {@link LabelKind} to its {@link OverlayAdapter}.
 * Real entries forward to dedicated adapter files; unimplemented kinds
 * use {@link notImplemented} so adding a new kind is a single-line swap
 * here plus a new adapter file.
 */
export const overlayAdapters: OverlayAdapterRegistry = {
  detection: detectionAdapter,
  polyline: notImplemented("polyline"),
  keypoint: notImplemented("keypoint"),
  segmentation: notImplemented("segmentation"),
  heatmap: notImplemented("heatmap"),
  mask: notImplemented("mask"),
};
