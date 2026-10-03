/**
 * Per-frame singleton labels (see `SINGLETON_LABEL_TYPES`) between the wire
 * and the {@link FrameStore}. The store addresses a singleton by its field
 * (`_id` is `singletonAddressId(path)`, the timeline track's id) and keeps the
 * stored document's own id as `_docId`; the wire carries only the document id.
 */

import type { JSONDeltas, LabelData } from "@fiftyone/utilities";
import { normalizeForCompare, structuralSupplier } from "@fiftyone/utilities";

import { singletonAddressId } from "../identity/ref";

/** A raw field value (`/frames`, window or patch payload) as a store label. */
export const fromSingletonWire = (
  value: Record<string, unknown>,
  path: string,
): LabelData => ({
  ...value,
  _id: singletonAddressId(path),
  _docId: (value._id as string | undefined) ?? "",
  _cls: (value._cls as string | undefined) ?? "",
});

/** A store label as the field value the server stores. */
export const toSingletonWire = (label: LabelData): Record<string, unknown> => {
  const { _docId, _id: _address, ...rest } = label;

  return _docId ? { ...rest, _id: _docId } : rest;
};

/**
 * JSON-Patch ops at `pointer` (`/frames/<n>/<field>`) turning one frame's
 * singleton `baseline` into `current`. A new document id is a whole-value
 * write, so the server never re-ids an existing document in place.
 */
export const singletonDelta = (
  current: LabelData | undefined,
  baseline: LabelData | undefined,
  pointer: string,
): JSONDeltas => {
  if (!current) {
    return baseline ? [{ op: "remove", path: pointer }] : [];
  }

  const wire = toSingletonWire(current);

  if (!baseline) {
    return [{ op: "add", path: pointer, value: normalizeForCompare(wire) }];
  }

  const base = toSingletonWire(baseline);

  if (base._id !== wire._id) {
    return [{ op: "replace", path: pointer, value: normalizeForCompare(wire) }];
  }

  return structuralSupplier(base, wire).map((op) => ({
    ...op,
    path: `${pointer}${op.path}`,
  }));
};
