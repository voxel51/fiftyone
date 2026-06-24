import type { LabelRef } from "@fiftyone/annotation";
import type { LabelData, LabelType } from "@fiftyone/utilities";
import { isEqual } from "lodash";

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

/** A label edit partitioned by how it propagates across a track's frames. */
export interface TrackEditSplit {
  /** Static track-level keys — fan across every frame of the instance. */
  trackPartial: Record<string, unknown>;
  /** Schema-declared dynamic keys — forward-fill from the edited frame. */
  dynamicPartial: Record<string, unknown>;
}

/**
 * Split a label edit into its track-level and dynamic-attribute halves, dropping
 * geometry + identity. A key named in `dynamicKeys` carries per-frame meaning
 * (it may change within the track), so it propagates forward from the edited
 * frame rather than across the whole track; everything else is track-level.
 */
export const splitTrackEdit = (
  value: Record<string, unknown>,
  dynamicKeys: ReadonlySet<string>
): TrackEditSplit => {
  const trackPartial: Record<string, unknown> = {};
  const dynamicPartial: Record<string, unknown> = {};

  for (const [key, keyValue] of Object.entries(value)) {
    if (PER_FRAME_KEYS.has(key)) {
      continue;
    }

    if (dynamicKeys.has(key)) {
      dynamicPartial[key] = keyValue;
      continue;
    }

    trackPartial[key] = keyValue;
  }

  return { trackPartial, dynamicPartial };
};

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

/**
 * Forward-fill a dynamic-attribute edit from the anchor frame onward. For each
 * key, every later frame that still holds the anchor's pre-edit value adopts the
 * new value, stopping at the first frame whose value already differs — that
 * boundary is an existing change the edit must preserve. Sample-and-hold: the
 * new value runs until the track's next change point (or the clip's end). Earlier
 * frames are untouched; the anchor frame itself is written by the caller.
 */
export const buildForwardFill = (
  engine: TrackFanOutEngine,
  anchor: LabelRef,
  dynamicPartial: Record<string, unknown>,
  anchorBefore: Record<string, unknown>
): FanOutWrite[] => {
  if (Object.keys(dynamicPartial).length === 0 || anchor.frame == null) {
    return [];
  }

  const type = engine.getLabelType(anchor.path);

  const laterFrames = engine
    .enumerateLabels([type])
    .filter(
      (ref) =>
        ref.sample === anchor.sample &&
        ref.path === anchor.path &&
        ref.instanceId === anchor.instanceId &&
        ref.frame != null &&
        ref.frame > anchor.frame
    )
    .sort((a, b) => (a.frame as number) - (b.frame as number));

  const writes: FanOutWrite[] = [];

  for (const [key, value] of Object.entries(dynamicPartial)) {
    const fromValue = key in anchorBefore ? anchorBefore[key] : null;

    for (const ref of laterFrames) {
      const before = (engine.getLabel(ref) ?? {}) as Record<string, unknown>;
      const current = key in before ? before[key] : null;

      if (!isEqual(current, fromValue)) {
        break;
      }

      writes.push({
        ref,
        forward: { [key]: value },
        inverse: { [key]: current },
      });
    }
  }

  return writes;
};
