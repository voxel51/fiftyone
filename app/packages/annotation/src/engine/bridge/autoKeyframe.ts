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
 * Always promotes when the geometry gate trips: a user resize on an
 * already-keyframed frame re-anchors that keyframe's geometry, which means
 * the bracketing tween segments need to re-interp. Downstream listeners
 * (e.g. `useAutoInterpolate`) coalesce bursts via a microtask drain so a
 * drag-resize doesn't fan out into N redundant interp passes.
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

  return { ...partial, keyframe: true };
};
