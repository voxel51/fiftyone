/**
 * Auto-keyframe rule for frame-level geometry edits.
 *
 * A frame-level Detection or Polyline whose geometry is moved by the user is a
 * real keyframe by definition — the user pinned this shape to this frame and
 * the timeline must show its diamond. Without this flag the per-frame
 * `keyframe` boolean stays false (or absent for propagation-filled frames),
 * no diamond renders, and the autointerpolate hook can't anchor.
 *
 * The rule is path-, field-, and change-gated to avoid promoting unrelated
 * commits:
 *
 * - Path must start with `frames.` — video annotation always addresses by
 *   `frames.<field>`; image/3D annotation addresses sample-level paths and is
 *   not touched.
 * - Partial must carry geometry (`bounding_box` or `points`) — a
 *   class/attribute-only edit must not flip the geometry-keyframe flag, since
 *   geometry keyframes and attribute "keyframes" are tracked independently.
 * - The partial's geometry must differ from the current label's geometry — a
 *   selection-only click on an existing label still flows through `commit`
 *   (the adapter has no signal to distinguish select from edit and emits the
 *   full bbox/points each time). Comparing against `current` filters that
 *   out so a pure click does NOT promote.
 *
 * Promotes (and signals re-anchor via a fresh object reference) whenever a
 * REAL geometry change lands — including a resize on an already-keyframed
 * frame (Case B), which re-anchors the keyframe's geometry so the bracketing
 * tween segments need to re-interp. Downstream listeners (e.g.
 * `useAutoInterpolate`) coalesce bursts via a microtask drain so a
 * drag-resize doesn't fan out into N redundant interp passes.
 */
import type { LabelData } from "@fiftyone/utilities";

// Pixel-space float comparison: bbox/points are normalized [0,1] floats; an
// epsilon below the sub-pixel threshold of any reasonable image avoids
// float-noise false positives without missing real 1-pixel nudges.
const GEOMETRY_EPSILON = 1e-9;

const numbersDiffer = (a: unknown, b: unknown): boolean => {
  if (typeof a !== "number" || typeof b !== "number") {
    // structural mismatch (e.g. one side undefined) counts as a change
    return a !== b;
  }
  return Math.abs(a - b) > GEOMETRY_EPSILON;
};

const arraysDiffer = (a: unknown, b: unknown): boolean => {
  if (!Array.isArray(a) || !Array.isArray(b)) {
    return a !== b;
  }
  if (a.length !== b.length) {
    return true;
  }
  for (let i = 0; i < a.length; i++) {
    const ai = a[i];
    const bi = b[i];
    if (Array.isArray(ai) || Array.isArray(bi)) {
      if (arraysDiffer(ai, bi)) {
        return true;
      }
    } else if (numbersDiffer(ai, bi)) {
      return true;
    }
  }
  return false;
};

const geometryChanged = (
  partial: Partial<LabelData>,
  current: LabelData | undefined,
): boolean => {
  // no current => can't compare; treat as a change (create-like commit)
  if (!current) {
    return true;
  }
  if ("bounding_box" in partial) {
    if (arraysDiffer(partial.bounding_box, current.bounding_box)) {
      return true;
    }
  }
  if ("points" in partial) {
    if (arraysDiffer(partial.points, current.points)) {
      return true;
    }
  }
  return false;
};

export const autoKeyframeOnGeometryEdit = (
  refPath: string,
  partial: Partial<LabelData>,
  current?: LabelData,
): Partial<LabelData> => {
  const isFrameLevelGeometry =
    refPath.startsWith("frames.") &&
    ("bounding_box" in partial || "points" in partial);

  if (!isFrameLevelGeometry) {
    return partial;
  }

  // Pure-click guard: the commit pipeline fires for selection-only clicks too
  // (the surface has no edit-vs-select signal), and the adapter emits the
  // full current geometry. If nothing actually moved, skip promotion AND
  // skip the dispatch — return the original reference so the controller's
  // identity check (`partial !== rawPartial`) reports "not promoted".
  if (!geometryChanged(partial, current)) {
    return partial;
  }

  return { ...partial, keyframe: true };
};
