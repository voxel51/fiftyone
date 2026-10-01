/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { JSONDeltas, LabelData } from "@fiftyone/utilities";
import { LabelType } from "@fiftyone/utilities";

/**
 * The group-wide label fields a patch touches, keyed by the field's JSON
 * pointer, each with its value after the patch; `null` once deleted.
 */
export type GroupLabelValues = ReadonlyMap<string, LabelData | null>;

export interface GroupLabelReads {
  labelType: (path: string) => LabelType;
  /** The anchor's current label at a sample-level path, if any. */
  value: (path: string) => LabelData | undefined;
}

const FRAMES_POINTER = /^\/frames\//;

const decodeSegment = (segment: string): string =>
  segment.replace(/~1/g, "/").replace(/~0/g, "~");

/**
 * Collect the group-wide fields the anchor's sample-level ops touch. On a
 * dynamic group played as video, a single `Classification` field describes
 * the whole clip, so it applies to every member rather than to the anchor
 * alone.
 *
 * Reads must happen before any await: the values are the state the ops were
 * diffed from.
 */
export const groupLabelValues = (
  deltas: JSONDeltas,
  reads: GroupLabelReads,
): GroupLabelValues => {
  const values = new Map<string, LabelData | null>();

  for (const op of deltas) {
    if (FRAMES_POINTER.test(op.path)) {
      continue;
    }

    const encoded = op.path.split("/").slice(1);
    const segments = encoded.map(decodeSegment);

    for (let depth = 1; depth <= segments.length; depth++) {
      const path = segments.slice(0, depth).join(".");

      if (reads.labelType(path) !== LabelType.Classification) {
        continue;
      }

      const pointer = `/${encoded.slice(0, depth).join("/")}`;
      if (!values.has(pointer)) {
        values.set(pointer, reads.value(path) ?? null);
      }

      break;
    }
  }

  return values;
};

/**
 * Whole-field writes copying each group-wide label onto one member: `add`
 * replaces whatever the member holds, and a deleted label writes `null`, so
 * the ops apply whether the member agreed with the anchor or not. Each copy
 * gets its own `_id`.
 */
export const groupLabelCopies = (
  values: GroupLabelValues,
  mintId: () => string,
): JSONDeltas =>
  [...values].map(([path, value]) => ({
    op: "add",
    path,
    value: value ? { ...value, _cls: "Classification", _id: mintId() } : null,
  }));
