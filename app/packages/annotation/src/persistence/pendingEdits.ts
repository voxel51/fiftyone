/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { extractNestedField } from "@fiftyone/core/src/utils/json";
import { isObject } from "@fiftyone/utilities";
import { isUnchanged, type LabelFieldDelta } from "../deltas";

/**
 * The annotation client's record of pending edits: for each edited
 * label/field, the value the server is known to hold (``original``) and the
 * value after the user's most recent edit (``latest``, ``null`` = delete).
 *
 * Every edit is recorded the moment it happens; a flush takes the net change
 * (original → latest) per key; a server ack advances ``original`` (success)
 * or rebases it from the server's reported state (conflict). An entry exists
 * iff there is unacknowledged work — a field the user never touched, or whose
 * edits are fully saved, is unknown to the store. Preconditions therefore
 * never depend on any render cache, and any number of edits within an
 * autosave interval net to at most one update per label.
 */

type Entry = {
  field: string;
  listKey: string | null;
  labelId: string | null;
  /** Value the server is known to hold (the save precondition). */
  original: unknown;
  /** Value after the most recent edit; ``null`` requests a delete. */
  latest: unknown;
  /** Bumped per edit; compared against ``flushedSeq`` to detect edits that
   * arrived while a flush was on the wire. */
  editSeq: number;
  flushedSeq: number | null;
};

const keyOf = (sampleId: string, field: string, labelId: string | null) =>
  `${sampleId} ${field} ${labelId ?? ""}`;

const sampleOf = (key: string) => key.slice(0, key.indexOf(" "));

// Reads the label/field's value out of the server's reported document during
// conflict rebasing; the document is already FE-shaped.
const extractCurrentValue = (
  doc: unknown,
  { field, listKey, labelId }: LabelFieldDelta
): unknown => {
  if (!isObject(doc)) {
    return null;
  }
  const fieldValue = extractNestedField(doc as Record<string, unknown>, field);
  if (!listKey) {
    return fieldValue ?? null;
  }
  const list = isObject(fieldValue)
    ? (fieldValue as Record<string, unknown>)[listKey]
    : null;
  if (!Array.isArray(list)) {
    return null;
  }
  return (
    list.find((e) => isObject(e) && (e as { _id?: string })._id === labelId) ??
    null
  );
};

const toDelta = (entry: Entry): LabelFieldDelta => ({
  field: entry.field,
  listKey: entry.listKey,
  labelId: entry.labelId,
  previousValue: entry.original ?? null,
  newValue: entry.latest,
});

export class PendingEdits {
  private entries = new Map<string, Entry>();

  /**
   * Only the first record for a key captures ``previousValue`` as the
   * server-held original; later records move only ``latest``, so the gate
   * stays anchored to what the server actually has no matter how many times
   * the user edits before a flush. ``newValue === null`` is a delete.
   */
  record(sampleId: string, delta: LabelFieldDelta): void {
    const key = keyOf(sampleId, delta.field, delta.labelId);
    const entry = this.entries.get(key);
    if (entry) {
      entry.latest = delta.newValue;
      entry.editSeq++;
      return;
    }
    this.entries.set(key, {
      field: delta.field,
      listKey: delta.listKey,
      labelId: delta.labelId,
      original: delta.previousValue,
      latest: delta.newValue,
      editSeq: 1,
      flushedSeq: null,
    });
  }

  sampleIds(): string[] {
    const ids = new Set<string>();
    for (const key of this.entries.keys()) {
      ids.add(sampleOf(key));
    }
    return [...ids];
  }

  /**
   * Unlike {@link take}, this does no flush bookkeeping — it exists so a
   * conflict rebase can re-overlay still-unsaved intent onto the server's
   * reconciled document without consuming the entries.
   */
  pendingDeltas(sampleId: string): LabelFieldDelta[] {
    const out: LabelFieldDelta[] = [];
    for (const [key, entry] of this.entries) {
      if (sampleOf(key) === sampleId) {
        out.push(toDelta(entry));
      }
    }
    return out;
  }

  /**
   * The net deltas to flush for ``sampleId``. Entries whose edits net to
   * nothing (back to the original, or added-then-deleted before ever being
   * saved) are resolved here and forgotten.
   */
  take(sampleId: string): LabelFieldDelta[] {
    const out: LabelFieldDelta[] = [];
    for (const [key, entry] of this.entries) {
      if (sampleOf(key) !== sampleId) {
        continue;
      }
      if (isUnchanged(entry.original, entry.latest)) {
        this.entries.delete(key);
        continue;
      }
      entry.flushedSeq = entry.editSeq;
      out.push(toDelta(entry));
    }
    return out;
  }

  /**
   * The server applied ``delta``: it now holds the flushed value. The entry is
   * done unless the user edited it again while the save was on the wire — then
   * it stays, and the next flush sends the remaining net change on top of the
   * new original.
   */
  ackApplied(sampleId: string, delta: LabelFieldDelta): void {
    const key = keyOf(sampleId, delta.field, delta.labelId);
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    if (entry.editSeq === entry.flushedSeq) {
      this.entries.delete(key);
      return;
    }
    entry.original = delta.newValue;
    entry.flushedSeq = null;
  }

  /**
   * ``delta`` missed its precondition: rebase ``original`` from the server's
   * reported document state. If the server already holds what the user wants
   * (e.g. the label is gone and we wanted it deleted) the entry is done;
   * otherwise the next flush retries with a correct precondition —
   * self-healing by construction.
   */
  ackConflict(
    sampleId: string,
    delta: LabelFieldDelta,
    serverDocument: unknown
  ): void {
    const key = keyOf(sampleId, delta.field, delta.labelId);
    const entry = this.entries.get(key);
    if (!entry) {
      return;
    }
    entry.original = extractCurrentValue(serverDocument, delta);
    entry.flushedSeq = null;
    if (isUnchanged(entry.original, entry.latest)) {
      this.entries.delete(key);
    }
  }

  reset(): void {
    this.entries.clear();
  }
}

/**
 * The app-wide store. The modal edits one sample at a time and every entry is
 * keyed by sample id, so a single instance is safe across navigation — a
 * flush that completes after the user navigated away still acks correctly.
 */
export const pendingEdits = new PendingEdits();
