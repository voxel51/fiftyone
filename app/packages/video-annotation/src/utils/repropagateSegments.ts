import type { FrameRange } from "../streams/fetchedRanges";

/**
 * The `[from, to]` keyframe pairs whose in-between frames need re-propagation
 * after `changedFrame` became (`set`) or stopped being (`removed`) a keyframe.
 * `set` yields both bracketing sides; `removed` yields the wider prev→next span;
 * a side with no bracketing keyframe is skipped.
 */
export function resolveSegmentsToRepropagate(
  keyframeFrames: number[],
  changedFrame: number,
  kind: "set" | "removed",
): FrameRange[] {
  const sorted = [...keyframeFrames].sort((a, b) => a - b);
  const prev = sorted.filter((f) => f < changedFrame).at(-1) ?? null;
  const next = sorted.find((f) => f > changedFrame) ?? null;

  const segments: FrameRange[] = [];

  if (kind === "set") {
    if (prev !== null) {
      segments.push([prev, changedFrame]);
    }

    if (next !== null) {
      segments.push([changedFrame, next]);
    }
  } else if (prev !== null && next !== null) {
    segments.push([prev, next]);
  }

  return segments;
}
