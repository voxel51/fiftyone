import {
  type AnnotationFieldUpdate,
  SaveConflictError,
  saveAnnotationFieldUpdates,
  transformSampleData,
} from "@fiftyone/core/src/client";
import { extractNestedField } from "@fiftyone/core/src/utils/json";
import type { Sample } from "@fiftyone/looker";
import { type Field, isObject } from "@fiftyone/utilities";
import {
  buildLabelFieldDelta,
  type LabelFieldDelta,
  type LabelProxy,
} from "../deltas";
import type { OpType } from "../types";

/**
 * Everything needed to address a delta against the right collection(s).
 */
export type SaveContext = {
  /** Source dataset `_id` → `samples.<datasetId>`. */
  datasetId: string;
  /** The modal sample (the patches sample, when generated). */
  sample: Sample;
  /**
   * Update the sample in place (modal + grid tile) — NOT a grid refresh. Backed
   * by `useUpdateSamples`, which patches the looker for the tile directly so
   * the edit shows without reloading the grid.
   */
  updateSample: (sample: Sample) => void;
  isGenerated?: boolean;
  /** Generated (patches) dataset name; the backend resolves its collection. */
  generatedDatasetName?: string;
};

/**
 * Turn one captured delta into the gated update(s) to send: one for a normal
 * edit, two for a patches edit (the patches sample + the source label).
 */
export const buildUpdatesForDelta = (
  delta: LabelFieldDelta,
  ctx: SaveContext
): AnnotationFieldUpdate[] => {
  const sourceLookupPath = delta.listKey
    ? `${delta.field}.${delta.listKey}`
    : delta.field;

  if (!ctx.isGenerated) {
    return [
      {
        collection: `samples.${ctx.datasetId}`,
        id: ctx.sample._id,
        lookupPath: sourceLookupPath,
        labelId: delta.labelId,
        previousValue: delta.previousValue,
        newValue: delta.newValue,
      },
    ];
  }

  // A generated save needs both ids; without them we'd send a malformed request
  // or silently skip the source write. Fail loudly instead.
  const sourceSampleId = (ctx.sample as Sample & { _sample_id?: string })
    ._sample_id;
  if (!ctx.generatedDatasetName || !sourceSampleId) {
    throw new Error(
      "Cannot persist a generated-view label without both a generated dataset " +
        "name and the source sample id (_sample_id)"
    );
  }

  const updates: AnnotationFieldUpdate[] = [];

  // The patches sample stores the label flat (to_patches) or as a list element
  // (evaluation patches) — address it to match its own shape. `field` may be a
  // nested (dotted) path.
  const patchField = extractNestedField<Record<string, unknown>>(
    ctx.sample as unknown as Record<string, unknown>,
    delta.field
  );
  const patchIsList =
    !!delta.listKey &&
    isObject(patchField) &&
    Array.isArray((patchField as Record<string, unknown>)[delta.listKey]);

  if (patchIsList) {
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      lookupPath: sourceLookupPath,
      labelId: delta.labelId,
      previousValue: delta.previousValue,
      newValue: delta.newValue,
    });
  } else if (delta.newValue === null) {
    // A flat patch sample IS the label — deleting it deletes the document.
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      op: "deleteDocument",
    });
  } else {
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      lookupPath: delta.field,
      labelId: null,
      previousValue: delta.previousValue,
      newValue: delta.newValue,
    });
  }

  // The source sample holds the same label in a list field.
  updates.push({
    collection: `samples.${ctx.datasetId}`,
    id: sourceSampleId,
    lookupPath: sourceLookupPath,
    labelId: delta.labelId,
    previousValue: delta.previousValue,
    newValue: delta.newValue,
  });

  return updates;
};

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

/**
 * Apply a saved delta to the local modal sample so the baseline matches what
 * was persisted — otherwise the next auto-save flush would re-send it (and
 * spuriously conflict). Values are already in FE shape.
 */
const applyDeltaToSample = (
  sample: Record<string, unknown>,
  delta: LabelFieldDelta
): void => {
  // `field` may be a nested (dotted) path — read/write it accordingly.
  const fieldValue = extractNestedField<Record<string, unknown>>(
    sample,
    delta.field
  );
  const isList =
    !!delta.listKey &&
    isObject(fieldValue) &&
    Array.isArray((fieldValue as Record<string, unknown>)[delta.listKey]);

  // Flat label (to_patches) or a flat/primitive field: replace or delete it.
  if (!isList) {
    setNestedField(
      sample,
      delta.field,
      delta.newValue === null ? undefined : delta.newValue
    );
    return;
  }

  // List field (normal view or evaluation patches): replace/add/remove by id.
  const listKey = delta.listKey as string;
  const container = { ...((fieldValue as Record<string, unknown>) ?? {}) };
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

/**
 * On a precondition conflict the editor's baseline may be stale in more than
 * the field it tried to write, so the server returns the conflicting document's
 * full current state. Reconcile the modal sample from it — overlaying every
 * server field while preserving FE-only fields (e.g. resolved media urls) —
 * so all concurrently-changed fields are brought up to date, no refetch.
 */
const reconcileConflicts = (
  error: SaveConflictError,
  updates: AnnotationFieldUpdate[],
  ctx: SaveContext
): void => {
  let next = ctx.sample as unknown as Record<string, unknown>;
  let changed = false;

  for (const { index, value } of error.conflicts) {
    const update = updates[index];
    // Only reconcile the document the modal is actually showing; `value` is
    // null when that document was deleted out from under us.
    if (
      !update ||
      String(update.id) !== String(ctx.sample._id) ||
      value == null
    ) {
      continue;
    }
    next = {
      ...next,
      ...(transformSampleData(value as Record<string, unknown>) as Record<
        string,
        unknown
      >),
    };
    changed = true;
  }

  if (changed) {
    ctx.updateSample(next as unknown as Sample);
  }
};

/**
 * Persist a batch of captured deltas (old + new value per edit).
 *
 * @returns `true` on success, `false` on a non-conflict failure
 * @throws SaveConflictError after reconciling the modal sample, so callers can
 *   surface the conflict (and the retry controller can re-run)
 */
export const saveAnnotationDeltas = async (
  deltas: LabelFieldDelta[],
  ctx: SaveContext
): Promise<boolean> => {
  if (!ctx.datasetId || !ctx.sample?._id) {
    return false;
  }
  if (deltas.length === 0) {
    return true;
  }

  const updates = deltas.flatMap((delta) => buildUpdatesForDelta(delta, ctx));
  if (updates.length === 0) {
    return true;
  }

  try {
    await saveAnnotationFieldUpdates(ctx.datasetId, ctx.sample._id, updates);

    // Sync the local baseline to what we just persisted so subsequent flushes
    // don't re-send (and conflict on) it. Updates the modal and grid tile in
    // place — it does NOT refresh the grid.
    const next = { ...(ctx.sample as unknown as Record<string, unknown>) };
    for (const delta of deltas) {
      applyDeltaToSample(next, delta);
    }
    ctx.updateSample(next as unknown as Sample);

    return true;
  } catch (error) {
    if (error instanceof SaveConflictError) {
      reconcileConflicts(error, updates, ctx);
      console.warn(
        "Annotation save conflict; reconciled affected fields from server",
        error.conflicts
      );
      throw error;
    }
    console.error("Annotation save failed", error);
    return false;
  }
};

export type LabelPersistenceArgs = {
  sample: Sample | null;
  datasetId: string | null;
  updateSample: (sample: Sample) => void;
  annotationLabel: LabelProxy | null;
  schema: Field;
  opType: OpType;
  isGenerated?: boolean;
  generatedDatasetName?: string;
};

/**
 * Persist a single sidebar label upsert/delete: capture its before/after and
 * send.
 */
export const handleLabelPersistence = async ({
  sample,
  datasetId,
  updateSample,
  annotationLabel,
  schema,
  opType,
  isGenerated = false,
  generatedDatasetName,
}: LabelPersistenceArgs): Promise<boolean> => {
  if (!sample || !datasetId) {
    console.error("missing sample or dataset id");
    return false;
  }
  if (!annotationLabel) {
    console.error("missing annotation label");
    return false;
  }

  const delta = buildLabelFieldDelta(
    sample,
    annotationLabel,
    schema,
    opType,
    isGenerated
  );
  if (!delta) {
    // Nothing actually changed — a no-op is success, not a failure (mirrors
    // saveAnnotationDeltas treating an empty batch as success).
    return true;
  }

  return saveAnnotationDeltas([delta], {
    datasetId,
    sample,
    updateSample,
    isGenerated,
    generatedDatasetName,
  });
};
