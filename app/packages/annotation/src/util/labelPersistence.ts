import {
  type AnnotationFieldUpdate,
  SaveConflictError,
  saveAnnotationFieldUpdates,
  transformSampleData,
} from "@fiftyone/core/src/client";
import { extractNestedField } from "@fiftyone/core/src/utils/json";
import type { Sample } from "@fiftyone/looker";
import { isObject } from "@fiftyone/utilities";
import type { LabelFieldDelta } from "../deltas";
import { applyDeltaToSample } from "../persistence/applyDelta";
import { pendingEdits } from "../persistence/pendingEdits";

export { applyDeltaToSample };

/**
 * A delta that failed its precondition, with the server's reported current
 * state of the document (FE-shaped; `null` if the document was deleted).
 */
export type ConflictedDelta = {
  delta: LabelFieldDelta;
  serverDocument: unknown;
};

/**
 * Everything needed to address a delta against the right collection(s).
 */
export type SaveContext = {
  /** Source dataset `_id` → `samples.<datasetId>`. */
  datasetId: string;
  /** The modal sample (the patches sample, when generated). */
  sample: Sample;
  /**
   * Write a reconciled sample to the canonical store (which fans it out to the
   * modal + grid tile in place — NOT a grid refresh). Only called on conflict:
   * on success the canonical copy is already correct, because every edit wrote
   * through at record time.
   */
  updateSample: (sample: Sample) => void;
  /**
   * The freshest canonical copy of the sample, as the base for conflict
   * reconciliation (the user may have kept editing while the save was on the
   * wire). Defaults to `sample`.
   */
  getCurrentSample?: () => Sample | undefined;
  isGenerated?: boolean;
  /** Generated (patches) dataset name; the backend resolves its collection. */
  generatedDatasetName?: string;
  /**
   * The deltas the server applied (all of them on a clean save; the
   * non-conflicted ones on a 409). The pending-edits ledger advances its
   * originals from this.
   */
  onApplied?: (deltas: LabelFieldDelta[]) => void;
  /**
   * The deltas that failed their precondition, each with the server's current
   * document state. The pending-edits ledger rebases from this so the next
   * flush retries with a correct precondition.
   */
  onConflict?: (conflicts: ConflictedDelta[]) => void;
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
 * Map each conflicting update index back to its source delta, transforming the
 * server's reported document state to FE shape. A generated-view delta fans
 * out to two updates — keep whichever conflict carries a document.
 */
const mapConflictsToDeltas = (
  error: SaveConflictError,
  updateDeltas: LabelFieldDelta[]
): Map<LabelFieldDelta, unknown> => {
  const conflicted = new Map<LabelFieldDelta, unknown>();
  for (const { index, value } of error.conflicts) {
    const delta = updateDeltas[index];
    if (!delta) {
      continue;
    }
    const doc =
      value == null
        ? null
        : transformSampleData(value as Record<string, unknown>);
    if (!conflicted.has(delta) || doc != null) {
      conflicted.set(delta, doc);
    }
  }
  return conflicted;
};

/**
 * Persist a batch of captured deltas (old + new value per edit).
 *
 * Display state is NOT touched on success — the canonical sample copy already
 * shows every edit (write-through at record time), so a clean save only
 * advances the ledger via `ctx.onApplied`.
 *
 * On a 409 the server applied everything except the conflicted updates.
 * `ctx.onConflict` rebases the ledger, then the canonical copy is rebuilt as
 * `server-reported field state + every still-pending edit re-applied` and
 * written back (as an external change, so the annotation scene re-reads it).
 * No refetch, no refresh.
 *
 * @returns `true` on success, `false` on a non-conflict failure
 * @throws SaveConflictError so callers can surface the conflict
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

  // Source delta per update index, for mapping 409 conflicts back to deltas.
  const updates: AnnotationFieldUpdate[] = [];
  const updateDeltas: LabelFieldDelta[] = [];
  for (const delta of deltas) {
    for (const update of buildUpdatesForDelta(delta, ctx)) {
      updates.push(update);
      updateDeltas.push(delta);
    }
  }
  if (updates.length === 0) {
    return true;
  }

  try {
    await saveAnnotationFieldUpdates(ctx.datasetId, ctx.sample._id, updates);

    ctx.onApplied?.(deltas);

    return true;
  } catch (error) {
    if (error instanceof SaveConflictError) {
      const conflicted = mapConflictsToDeltas(error, updateDeltas);
      const applied = deltas.filter((delta) => !conflicted.has(delta));
      if (applied.length) {
        ctx.onApplied?.(applied);
      }
      // Rebase the ledger first — pendingDeltas below must reflect it.
      ctx.onConflict?.(
        [...conflicted].map(([delta, serverDocument]) => ({
          delta,
          serverDocument,
        }))
      );

      // Rebuild the canonical copy for the document the modal is showing:
      // overlay the conflicting fields' current server state, then re-apply
      // every still-pending edit so unsaved intent stays visible and retries
      // next flush (`value` is null when the document was deleted under us).
      const base = ctx.getCurrentSample?.() ?? ctx.sample;
      const next = { ...(base as unknown as Record<string, unknown>) };
      for (const { index, value } of error.conflicts) {
        const update = updates[index];
        if (
          update &&
          String(update.id) === String(ctx.sample._id) &&
          value != null
        ) {
          Object.assign(
            next,
            transformSampleData(value as Record<string, unknown>)
          );
        }
      }
      for (const pending of pendingEdits.pendingDeltas(
        String(ctx.sample._id)
      )) {
        applyDeltaToSample(next, pending);
      }
      ctx.updateSample(next as unknown as Sample);

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
