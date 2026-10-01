/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { isEqual } from "lodash";
import type {
  VideoLabelIndexInstance,
  VideoLabelMemberIndexInstance,
} from "../../../core/src/client/videoLabelsClient";
import type { DynamicGroupMemberIndex } from "../state/dynamicGroupMemberIndex";
import type { IndexInstance } from "./frameTracks";

/** Each member sample id's frame number, frame `i + 1` for position `i`. */
export const frameNumbersByMember = (
  memberIndex: DynamicGroupMemberIndex,
): ReadonlyMap<string, number> =>
  new Map(memberIndex.map((member, idx) => [member, idx + 1]));

export const isMemberIndexInstance = (
  instance: VideoLabelIndexInstance | VideoLabelMemberIndexInstance,
): instance is VideoLabelMemberIndexInstance => "members" in instance;

/**
 * Fold frame numbers into contiguous inclusive `[start, end]` runs. Matches
 * the server's `run_length_encode`.
 */
export const runLengthEncode = (
  frames: Iterable<number>,
): Array<[number, number]> => {
  const ordered = Array.from(new Set(frames)).sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];

  for (const frame of ordered) {
    const last = runs[runs.length - 1];
    if (last && frame === last[1] + 1) {
      last[1] = frame;
    } else {
      runs.push([frame, frame]);
    }
  }

  return runs;
};

/**
 * Fold `[frame, value]` pairs into `[start, end, value]` runs that break on a
 * value change or a frame gap, a later value for the same frame winning.
 * Matches the server's `run_length_encode_values`.
 */
export const runLengthEncodeValues = (
  pairs: Iterable<readonly [number, unknown]>,
): Array<[number, number, unknown]> => {
  const byFrame = new Map<number, unknown>();
  for (const [frame, value] of pairs) {
    byFrame.set(frame, value);
  }

  const ordered = Array.from(byFrame.entries()).sort((a, b) => a[0] - b[0]);
  const runs: Array<[number, number, unknown]> = [];

  for (const [frame, value] of ordered) {
    const last = runs[runs.length - 1];
    if (last && frame === last[1] + 1 && isEqual(value, last[2])) {
      last[1] = frame;
    } else {
      runs.push([frame, frame, value]);
    }
  }

  return runs;
};

/**
 * Map a dynamic group's member-keyed index onto frames, producing the same
 * per-instance runs a video sample's index carries. Members missing from the
 * member index are skipped, and an instance left with no frames is dropped.
 */
export const toFrameIndexInstances = (
  instances: readonly VideoLabelMemberIndexInstance[],
  frameOf: ReadonlyMap<string, number>,
): IndexInstance[] => {
  const toFrames = (members: readonly string[]): number[] =>
    members.flatMap((member) => {
      const frame = frameOf.get(member);
      return frame === undefined ? [] : [frame];
    });

  const result: IndexInstance[] = [];
  for (const {
    members,
    keyframeMembers,
    attributeValues,
    ...metadata
  } of instances) {
    const segments = runLengthEncode(toFrames(members));
    if (segments.length === 0) {
      continue;
    }

    const entry: IndexInstance = {
      ...metadata,
      segments,
      keyframes: Array.from(new Set(toFrames(keyframeMembers))).sort(
        (a, b) => a - b,
      ),
    };

    if (attributeValues) {
      const attributeSegments: Record<
        string,
        Array<[number, number, unknown]>
      > = {};
      for (const [attr, pairs] of Object.entries(attributeValues)) {
        const runs = runLengthEncodeValues(
          pairs.flatMap(([member, value]): Array<[number, unknown]> => {
            const frame = frameOf.get(member);
            return frame === undefined ? [] : [[frame, value]];
          }),
        );
        if (runs.length > 0) {
          attributeSegments[attr] = runs;
        }
      }

      entry.attributeSegments = attributeSegments;
    }

    result.push(entry);
  }

  return result;
};
