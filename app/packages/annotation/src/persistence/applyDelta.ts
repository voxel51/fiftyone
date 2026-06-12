/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { extractNestedField } from "@fiftyone/core/src/utils/json";
import { isObject } from "@fiftyone/utilities";
import type { LabelFieldDelta } from "../deltas";

/**
 * Set (or delete, when `value === undefined`) a possibly-dotted `path` on a
 * shallow copy, cloning intermediate objects so the original isn't mutated.
 */
const setNestedField = (
  root: Record<string, unknown>,
  path: string,
  value: unknown
): void => {
  const parts = path.split(".");
  const leaf = parts.pop() as string;
  let cursor = root;
  for (const part of parts) {
    const child = cursor[part];
    cursor[part] = isObject(child) ? { ...(child as object) } : {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  if (value === undefined) {
    delete cursor[leaf];
  } else {
    cursor[leaf] = value;
  }
};

/** ``listKey`` → the ``_cls`` of the list container it lives in. */
const LIST_KEY_TO_CONTAINER_CLS: Record<string, string> = {
  detections: "Detections",
  classifications: "Classifications",
  polylines: "Polylines",
  keypoints: "Keypoints",
};

/**
 * Apply a delta's new value to a (shallow-copied) local sample document, so
 * the canonical copy keeps the invariant `server-known state + every pending
 * edit applied`. Values are already in FE shape.
 */
export const applyDeltaToSample = (
  sample: Record<string, unknown>,
  delta: LabelFieldDelta
): void => {
  // `field` may be a nested (dotted) path — read/write it accordingly.
  const fieldValue = extractNestedField<Record<string, unknown>>(
    sample,
    delta.field
  );

  // A flat/primitive field (no list key): replace or delete it.
  if (!delta.listKey) {
    setNestedField(
      sample,
      delta.field,
      delta.newValue === null ? undefined : delta.newValue
    );
    return;
  }

  const listKey = delta.listKey;
  const hasList =
    isObject(fieldValue) &&
    Array.isArray((fieldValue as Record<string, unknown>)[listKey]);

  if (!hasList) {
    // A to_patches modal sample stores the label itself (flat) at the field —
    // recognizable by its identity. Replace or delete it in place.
    const isFlatLabel =
      isObject(fieldValue) &&
      (fieldValue as { _id?: string })._id === delta.labelId;
    if (isFlatLabel) {
      setNestedField(
        sample,
        delta.field,
        delta.newValue === null ? undefined : delta.newValue
      );
      return;
    }

    // A list field that is empty/missing locally (the first label saved into
    // it). NEVER write the label flat here — that corrupts the field's shape
    // and poisons every later delta's previous value. Create the container.
    if (delta.newValue === null) {
      return;
    }
    setNestedField(sample, delta.field, {
      _cls: LIST_KEY_TO_CONTAINER_CLS[listKey] ?? listKey,
      [listKey]: [delta.newValue],
    });
    return;
  }

  // List field (normal view or evaluation patches): replace/add/remove by id.
  const container = { ...(fieldValue as Record<string, unknown>) };
  const list = [
    ...((container[listKey] as Array<Record<string, unknown>>) ?? []),
  ];
  const idx = list.findIndex(
    (e) => (e as { _id?: string })._id === delta.labelId
  );
  if (delta.newValue === null) {
    if (idx >= 0) list.splice(idx, 1);
  } else if (idx >= 0) {
    list[idx] = delta.newValue as Record<string, unknown>;
  } else {
    list.push(delta.newValue as Record<string, unknown>);
  }
  container[listKey] = list;
  setNestedField(sample, delta.field, container);
};
