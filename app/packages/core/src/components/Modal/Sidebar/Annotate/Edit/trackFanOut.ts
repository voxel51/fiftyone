import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData, LabelType } from "@fiftyone/utilities";

/**
 * A track is one identity across many frames. Geometry varies frame to frame,
 * but classification-level fields (label, index, custom attributes) describe
 * the whole track — so a sidebar edit to one of them on one frame should apply
 * to every frame the instance appears on. These are the keys that stay
 * PER-FRAME (geometry) plus the store-owned identity keys; everything else fans
 * out across the track.
 */
const PER_FRAME_KEYS = new Set([
  "bounding_box",
  "mask",
  "mask_path",
  "points",
  "_id",
  "instance",
]);

/** The track-level subset of a label edit (drops geometry + identity). */
export const trackLevelPartial = (
  value: Record<string, unknown>
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !PER_FRAME_KEYS.has(key))
  );

/** A (forward, inverse) write pair for one sibling-frame occurrence. */
export interface FanOutWrite {
  ref: LabelRef;
  forward: Record<string, unknown>;
  inverse: Record<string, unknown>;
}

/** The slice of the engine this helper reads — structural for easy stubbing. */
interface TrackFanOutEngine {
  getLabelType(path: string): LabelType;
  enumerateLabels(kinds: readonly LabelType[]): LabelRef[];
  getLabel(ref: LabelRef): LabelData | undefined;
}

/**
 * Fan a track-level edit across every OTHER frame the anchor's instance appears
 * on. `trackPartial` is merged onto each sibling (so their geometry survives);
 * the inverse restores each frame's prior value for exactly those keys (an
 * explicit null where the key was absent — the merge mutator would otherwise
 * resurrect it). Returns no writes for an image / sample-level anchor (it has no
 * sibling frames) or a geometry-only edit (empty `trackPartial`).
 */
export const buildTrackFanOut = (
  engine: TrackFanOutEngine,
  anchor: LabelRef,
  trackPartial: Record<string, unknown>
): FanOutWrite[] => {
  if (Object.keys(trackPartial).length === 0) {
    return [];
  }

  const type = engine.getLabelType(anchor.path);
  const writes: FanOutWrite[] = [];

  for (const ref of engine.enumerateLabels([type])) {
    if (
      ref.sample !== anchor.sample ||
      ref.path !== anchor.path ||
      ref.instanceId !== anchor.instanceId ||
      ref.frame === anchor.frame
    ) {
      continue;
    }

    const before = (engine.getLabel(ref) ?? {}) as Record<string, unknown>;
    const inverse: Record<string, unknown> = {};

    for (const key of Object.keys(trackPartial)) {
      inverse[key] = key in before ? before[key] : null;
    }

    writes.push({ ref, forward: trackPartial, inverse });
  }

  return writes;
};
