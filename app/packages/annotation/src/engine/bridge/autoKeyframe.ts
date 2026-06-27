/**
 * Auto-keyframe rule for frame-level geometry edits.
 *
 * A frame-level Detection or Polyline whose geometry is moved by the user is a
 * real keyframe by definition — the user pinned this shape to this frame and
 * the timeline must show its diamond. Without this flag the per-frame
 * `keyframe` boolean stays false (or absent for propagation-filled frames),
 * no diamond renders, and the autointerpolate hook can't anchor.
 *
 * The rule is path- and field-gated to avoid promoting unrelated edits:
 *
 * - Path must start with `frames.` — video annotation always addresses by
 *   `frames.<field>`; image/3D annotation addresses sample-level paths and is
 *   not touched.
 * - Partial must carry geometry (`bounding_box` or `points`) — a
 *   class/attribute-only edit must not flip the geometry-keyframe flag, since
 *   geometry keyframes and attribute "keyframes" are tracked independently.
 *
 * Idempotent: re-applying to an already-keyframed Detection is a no-op
 * write of `keyframe: true`, which the engine's update path collapses.
 */
import type { LabelData } from "@fiftyone/utilities";

export const autoKeyframeOnGeometryEdit = (
  refPath: string,
  partial: Partial<LabelData>,
): Partial<LabelData> => {
  const isFrameLevelGeometry =
    refPath.startsWith("frames.") &&
    ("bounding_box" in partial || "points" in partial);

  if (!isFrameLevelGeometry) {
    return partial;
  }

  // already a keyframe: identity pass-through so callers can detect a
  // promotion via reference equality (`partial !== rawPartial`)
  if (partial.keyframe === true) {
    return partial;
  }

  return { ...partial, keyframe: true };
};
