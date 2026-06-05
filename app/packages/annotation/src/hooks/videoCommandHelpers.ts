import {
  type LocalDetection,
  objectId,
  type SyntheticBox,
} from "@fiftyone/utilities";

/** Minimal stream shape the frame reader needs — a per-time snapshot getter. */
interface FrameSnapshotSource {
  getValue: (t: number) => { detections: SyntheticBox[] } | null;
}

/** Read this track's detection on a given frame, or `undefined`. */
export const detectionAt = (
  stream: FrameSnapshotSource,
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
export const copyDetection = (
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
