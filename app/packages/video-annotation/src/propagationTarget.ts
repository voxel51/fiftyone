import { frameAt } from "../../playback/src/lib/playback/utils";
import type { VideoFrameLabelsStream } from "./VideoFrameLabelsStream";

/**
 * Resolved input for a propagation run, or the reason one can't run yet.
 *
 * The `reason` strings are user-facing — they surface in the toolbar's
 * Propagate tooltip when the button is disabled, so they double as the
 * "why didn't this trigger?" diagnostic.
 */
export type PropagationTarget =
  | {
      ok: true;
      /** `Instance._id` shared by the selected detection's keyframes. */
      instanceId: string;
      /** Frame of the bracketing keyframe at or before the playhead. */
      fromFrame: number;
      /** Frame of the first keyframe strictly after the playhead. */
      toFrame: number;
    }
  | { ok: false; reason: string };

/**
 * Given the active stream, the currently-selected overlay ids, and the
 * visual playhead time, work out whether a linear-interpolation
 * propagation can run and, if so, between which keyframes.
 *
 * Shared by the `-` keybinding and the timeline toolbar so the two can't
 * disagree about eligibility. Pure (no React, no atoms) so it's trivially
 * unit-testable and callable from either a key handler or a render pass.
 *
 * Mirrors the bracketing-keyframe walk that previously lived inline in the
 * keybinding: the most recent keyframe at or before the playhead is the
 * left bracket, the first keyframe strictly after it is the right bracket.
 */
export function resolvePropagationTarget(
  stream: VideoFrameLabelsStream,
  selectedIds: readonly string[],
  time: number
): PropagationTarget {
  if (selectedIds.length === 0) {
    return { ok: false, reason: "Select a tracked object to propagate." };
  }

  const snapshot = stream.getValue(time);
  if (!snapshot) {
    return { ok: false, reason: "No labels loaded at the current frame yet." };
  }

  const selected = snapshot.detections.find((d) => selectedIds.includes(d.id));
  if (!selected) {
    return {
      ok: false,
      reason: "Selected object isn't present at this frame.",
    };
  }

  const instanceId = selected.instance?._id;
  if (!instanceId) {
    return {
      ok: false,
      reason:
        "Selected object has no instance id — draw it as a tracked box first.",
    };
  }

  const currentFrame = frameAt(time, stream.fps, stream.totalFrames);

  // Walk the cached frames for the bracketing keyframes: the most recent
  // keyframe at or before the playhead (left), and the first keyframe
  // strictly after (right). Left keeps updating until the loop hits a
  // frame past the playhead, at which point right is locked in.
  let leftFrame: number | null = null;
  let rightFrame: number | null = null;
  for (let f = 1; f <= stream.totalFrames; f++) {
    const snap = stream.getValue((f - 1) / stream.fps);
    if (!snap) continue;
    const det = snap.detections.find(
      (d) => d.keyframe && d.instance?._id === instanceId
    );
    if (!det) continue;
    if (f <= currentFrame) leftFrame = f;
    if (f > currentFrame && rightFrame === null) {
      rightFrame = f;
      break;
    }
  }

  if (leftFrame === null && rightFrame === null) {
    return {
      ok: false,
      reason: "No keyframes on this object yet — mark at least two (press K).",
    };
  }
  if (leftFrame === null) {
    return { ok: false, reason: "Need a keyframe at or before this frame." };
  }
  if (rightFrame === null) {
    return { ok: false, reason: "Need a keyframe after this frame." };
  }

  return { ok: true, instanceId, fromFrame: leftFrame, toFrame: rightFrame };
}
