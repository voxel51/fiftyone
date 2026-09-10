import type { JSONDeltas } from "@fiftyone/utilities";

/**
 * A composite video-store patch split for a dynamic group: frame ops rebased
 * onto their member sample's root, and sample-level ops that stay on the
 * modal sample.
 */
export interface MemberDeltas {
  /** Ops per frame number, pointers rebased from `/frames/<n>/X` to `/X`. */
  byFrame: Map<number, JSONDeltas>;
  /** Ops outside the `/frames` collection, untouched. */
  rest: JSONDeltas;
}

const FRAME_POINTER = /^\/frames\/(\d+)(\/.+)$/;

/**
 * Split a composite video-store patch into per-frame member patches. Each
 * dynamic-group "frame" is its own sample, so `/frames/<n>` is an addressing
 * prefix: `n` picks the member and the remainder is the pointer into it.
 */
export const splitMemberDeltas = (deltas: JSONDeltas): MemberDeltas => {
  const byFrame = new Map<number, JSONDeltas>();
  const rest: JSONDeltas = [];

  for (const op of deltas) {
    const match = FRAME_POINTER.exec(op.path);

    if (!match) {
      rest.push(op);
      continue;
    }

    const frame = Number(match[1]);
    const rebased = { ...op, path: match[2] };

    if ("from" in rebased && typeof rebased.from === "string") {
      const fromMatch = FRAME_POINTER.exec(rebased.from);

      if (!fromMatch || Number(fromMatch[1]) !== frame) {
        throw new Error(
          `cannot rebase op with cross-frame 'from' pointer: ${rebased.from}`,
        );
      }

      rebased.from = fromMatch[2];
    }

    const ops = byFrame.get(frame);
    if (ops) {
      ops.push(rebased);
    } else {
      byFrame.set(frame, [rebased]);
    }
  }

  return { byFrame, rest };
};
