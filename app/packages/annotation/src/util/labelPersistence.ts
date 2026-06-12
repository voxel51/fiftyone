import {
  type AnnotationFieldUpdate,
  SaveConflictError,
  saveAnnotationFieldUpdates,
  transformSampleData,
} from "@fiftyone/core/src/client";
import type { Sample } from "@fiftyone/looker";
import { type Field, isObject } from "@fiftyone/utilities";
import {
  buildLabelFieldChange,
  type LabelFieldChange,
  type LabelProxy,
} from "../deltas";
import type { OpType } from "../types";

/**
 * Everything needed to address a change against the right collection(s).
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
 * Turn one captured change (what it was + what it is now) into the gated
 * update(s) to send. A normal edit is one update; a patches edit is two — the
 * patches sample (flat) and the source label (in its list).
 */
export const buildUpdatesForChange = (
  change: LabelFieldChange,
  ctx: SaveContext
): AnnotationFieldUpdate[] => {
  const sourceLookupPath = change.listKey
    ? `${change.field}.${change.listKey}`
    : change.field;

  if (!ctx.isGenerated) {
    return [
      {
        collection: `samples.${ctx.datasetId}`,
        id: ctx.sample._id,
        lookupPath: sourceLookupPath,
        labelId: change.labelId,
        previousValue: change.previousValue,
        newValue: change.newValue,
      },
    ];
  }

  const sourceSampleId = (ctx.sample as Sample & { _sample_id?: string })
    ._sample_id;
  const updates: AnnotationFieldUpdate[] = [];

  // The patches sample stores this label either flattened (to_patches: the
  // sample IS the label) or as a list element (evaluation patches, where the
  // patch also holds e.g. predictions) — address it to match its own shape.
  const patchField = (ctx.sample as Record<string, unknown>)[change.field];
  const patchIsList =
    !!change.listKey &&
    isObject(patchField) &&
    Array.isArray((patchField as Record<string, unknown>)[change.listKey]);

  if (patchIsList) {
    // Add/modify/remove just this element of the patch sample's list.
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      lookupPath: sourceLookupPath,
      labelId: change.labelId,
      previousValue: change.previousValue,
      newValue: change.newValue,
    });
  } else if (change.newValue === null) {
    // The flat patch sample IS the label — deleting it deletes the document.
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      op: "deleteDocument",
    });
  } else {
    updates.push({
      datasetName: ctx.generatedDatasetName,
      id: ctx.sample._id,
      lookupPath: change.field,
      labelId: null,
      previousValue: change.previousValue,
      newValue: change.newValue,
    });
  }

  // The source sample holds the same label inside a list field.
  if (sourceSampleId) {
    updates.push({
      collection: `samples.${ctx.datasetId}`,
      id: sourceSampleId,
      lookupPath: sourceLookupPath,
      labelId: change.labelId,
      previousValue: change.previousValue,
      newValue: change.newValue,
    });
  }

  return updates;
};

/**
 * Apply a saved change to the local modal sample so the baseline matches what
 * was persisted — otherwise the next auto-save flush would re-send the same
 * change (and spuriously conflict). Values are already in FE shape.
 */
const applyChangeToSample = (
  sample: Record<string, unknown>,
  change: LabelFieldChange
): void => {
  const fieldValue = sample[change.field];
  const isList =
    !!change.listKey &&
    isObject(fieldValue) &&
    Array.isArray((fieldValue as Record<string, unknown>)[change.listKey]);

  // Flat label (to_patches) or a flat/primitive field: replace or delete it
  // wholesale.
  if (!isList) {
    if (change.newValue === null) {
      delete sample[change.field];
    } else {
      sample[change.field] = change.newValue;
    }
    return;
  }

  // List field (normal view or evaluation patches): replace/add/remove the
  // element by id.
  const container = {
    ...((sample[change.field] as Record<string, unknown>) ?? {}),
  };
  const list = [
    ...((container[change.listKey] as Array<Record<string, unknown>>) ?? []),
  ];
  const idx = list.findIndex(
    (e) => (e as { _id?: string })._id === change.labelId
  );
  if (change.newValue === null) {
    if (idx >= 0) list.splice(idx, 1);
  } else if (idx >= 0) {
    list[idx] = change.newValue as Record<string, unknown>;
  } else {
    list.push(change.newValue as Record<string, unknown>);
  }
  container[change.listKey] = list;
  sample[change.field] = container;
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
 * Persist a batch of captured changes (old value + new value per change).
 *
 * @returns `true` on success, `false` on a non-conflict failure
 * @throws SaveConflictError after reconciling the modal sample, so callers can
 *   surface the conflict (and the retry controller can re-run)
 */
export const saveAnnotationChanges = async (
  changes: LabelFieldChange[],
  ctx: SaveContext
): Promise<boolean> => {
  if (!ctx.datasetId || !ctx.sample?._id) {
    return false;
  }
  if (changes.length === 0) {
    return true;
  }

  const updates = changes.flatMap((change) =>
    buildUpdatesForChange(change, ctx)
  );
  if (updates.length === 0) {
    return true;
  }

  try {
    await saveAnnotationFieldUpdates(ctx.datasetId, ctx.sample._id, updates);

    // Sync the local baseline to what we just persisted so subsequent flushes
    // don't re-send (and conflict on) the same change. This updates the modal
    // and the grid tile in place — it does NOT refresh the grid.
    const next = { ...(ctx.sample as unknown as Record<string, unknown>) };
    for (const change of changes) {
      applyChangeToSample(next, change);
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

  const change = buildLabelFieldChange(
    sample,
    annotationLabel,
    schema,
    opType,
    isGenerated
  );
  if (!change) {
    return false;
  }

  return saveAnnotationChanges([change], {
    datasetId,
    sample,
    updateSample,
    isGenerated,
    generatedDatasetName,
  });
};
