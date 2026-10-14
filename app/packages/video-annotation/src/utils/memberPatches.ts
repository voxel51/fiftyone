/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONDeltas } from "@fiftyone/utilities";
import type { DynamicGroupMemberPatch } from "../../../core/src/client/annotationClient";
import { splitMemberDeltas } from "./memberDeltas";

export interface MemberPatches {
  /** Per-member patches for the group PATCH, in frame order. */
  patches: DynamicGroupMemberPatch[];
  /** Ops outside `/frames` that still need the single-sample PATCH. */
  rest: JSONDeltas;
}

const FRAME_POINTER = /^\/frames\/(\d+)\//;

/**
 * The composite ops that landed on `written` members of a rejected group
 * patch. List ops address elements by index, so re-sending one duplicates a
 * label or deletes the wrong one; reconciling them first keeps the retry to
 * the members that never landed.
 */
export const writtenMemberDeltas = (
  deltas: JSONDeltas,
  index: string[],
  written: readonly string[],
): JSONDeltas => {
  if (written.length === 0) {
    return [];
  }

  const frames = new Set<number>();
  for (const id of written) {
    const position = index.indexOf(id);

    if (position >= 0) {
      frames.add(position + 1);
    }
  }

  return deltas.filter((op) => {
    const match = FRAME_POINTER.exec(op.path);
    return match !== null && frames.has(Number(match[1]));
  });
};

/**
 * Translate composite `/frames/<n>/...` deltas into per-member patches. The
 * anchor sample is itself a member, so its sample-level ops ride the same
 * fan-out and validate against the group token.
 */
export const toMemberPatches = (
  deltas: JSONDeltas,
  index: string[],
  anchorId: string,
): MemberPatches => {
  const { byFrame, rest } = splitMemberDeltas(deltas);

  const patches: DynamicGroupMemberPatch[] = [];
  for (const [frame, ops] of byFrame) {
    const memberId = index[frame - 1];

    if (!memberId) {
      throw new Error(
        `dynamic group save: no member sample at frame ${frame} ` +
          `(index has ${index.length} members)`,
      );
    }

    patches.push({ sampleId: memberId, patch: ops });
  }

  if (rest.length === 0 || !index.includes(anchorId)) {
    return { patches, rest };
  }

  const anchor = patches.find((patch) => patch.sampleId === anchorId);
  if (anchor) {
    anchor.patch = [...anchor.patch, ...rest];
  } else {
    patches.push({ sampleId: anchorId, patch: rest });
  }

  return { patches, rest: [] };
};
