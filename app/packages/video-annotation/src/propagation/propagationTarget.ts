import { frameAt } from "@fiftyone/playback";
import type { VideoFrameLabelsStream } from "../streams/VideoFrameLabelsStream";

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
      /** Frame of the seed keyframe at or before the playhead. */
      fromFrame: number;
      /**
       * Last frame of the run. The first keyframe strictly after the playhead
       * (a *bracket* run), or — when there's no downstream keyframe — the end
       * of the track's contiguous presence run containing the playhead (a
       * *forward* run, filling the extended track). The command handler tells
       * the two apart by whether a keyframe sits at this frame, so no extra
       * flag is needed here.
       */
      toFrame: number;
    }
  | { ok: false; reason: string };

/**
 * Given the active stream, the currently-selected overlay ids, and the
 * visual playhead time, work out whether a SAM2 tracking run can start and,
 * if so, over which frame span.
 *
 * Two shapes of run:
 *   - **Bracket** — the playhead sits between two keyframes of the selected
 *     object; tracks the seed (left) keyframe up to the next (right) one.
 *   - **Forward** — there's a seed keyframe at/before the playhead but none
 *     after it; tracks forward to the end of the track's presence run (the
 *     extended-but-unfilled frames), matching the timeline bar. The user can
 *     halt early via the Stop control. SAM2's natural strength. Drawing then
 *     extending a track and triggering this fills the extension.
 *
 * Pure (no React, no atoms) so it's trivially unit-testable and callable
 * from a render pass. Used by the timeline toolbar's "Track (SAM2)" action.
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
      reason: "Mark a keyframe to seed propagation",
    };
  }
  if (leftFrame === null) {
    return { ok: false, reason: "Need a keyframe at or before this frame." };
  }

  // Bracketed run: a keyframe exists on both sides of the playhead.
  if (rightFrame !== null) {
    return { ok: true, instanceId, fromFrame: leftFrame, toFrame: rightFrame };
  }

  // Forward run: only the seed keyframe exists. Fill forward to the end of
  // the track's contiguous presence run containing the playhead.
  let endFrame = currentFrame;
  for (let f = currentFrame + 1; f <= stream.totalFrames; f++) {
    const present = stream
      .getValue((f - 1) / stream.fps)
      ?.detections.some((d) => d.instance?._id === instanceId);

    if (!present) {
      break;
    }

    endFrame = f;
  }

  if (endFrame <= leftFrame) {
    return {
      ok: false,
      reason: "Extend the track past this frame to fill it with SAM2.",
    };
  }

  return { ok: true, instanceId, fromFrame: leftFrame, toFrame: endFrame };
}
