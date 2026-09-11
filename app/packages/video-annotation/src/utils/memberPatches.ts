import type { JSONDeltas } from "@fiftyone/utilities";
import type { DynamicGroupMemberPatch } from "../../../core/src/client/annotationClient";
import { splitMemberDeltas } from "./memberDeltas";

export interface MemberPatches {
  /** Per-member patches for the group PATCH, in frame order. */
  patches: DynamicGroupMemberPatch[];
  /** Ops outside `/frames` that still need the single-sample PATCH. */
  rest: JSONDeltas;
}

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
