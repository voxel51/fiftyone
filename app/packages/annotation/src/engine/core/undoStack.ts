/**
 * Ledger of committed transaction inverses, captured per touched ref. Value-based
 * (not transient restores) so an undo survives persistence — applying an entry is
 * an ordinary transaction writing the before-values.
 *
 * The ledger records and coalesces entries; it does NOT navigate. Undo/redo
 * ordering lives in the global command stack (`@fiftyone/commands`), which
 * addresses entries by id via the engine's apply methods. The ledger exists for
 * entry construction, coalescing, await-and-rollback peeking, and lifecycle
 * drops.
 */

import type { LabelData } from "@fiftyone/utilities";
import { isEqual } from "lodash";

import type { LabelRef } from "../identity/ref";
import { refKey } from "../identity/ref";

/** One ref's inverse: `before` undefined = created, `after` undefined = deleted. */
export interface UndoOp {
  ref: LabelRef;
  before: LabelData | undefined;
  after: LabelData | undefined;
}

/** One undoable unit — a top-level transaction's touched refs, addressed by `id`. */
export interface UndoEntry {
  id: string;
  ops: UndoOp[];
  undoKey?: string;
}

/** Notified when a transaction commits an entry; `coalesced` = merged into the prior unit. */
export type UndoCommitListener = (entry: UndoEntry, coalesced: boolean) => void;

/** Notified when entries leave the ledger (rollback, store unregister). */
export type UndoDropListener = (ids: string[]) => void;

/** Last 4 chars of an id — enough to eyeball-match a gesture. */
const shortId = (id: string): string => id.slice(-4);

/**
 * Keys whose VALUE actually changed. `toLabel` rebuilds the whole label on
 * commit, so unchanged `tags`/`attributes` come back as fresh refs — diff by
 * reference first (cheap, and skips an unchanged mask), then confirm a ref-diff
 * with isEqual so value-equal rebuilds don't show as edits.
 */
const changedKeys = (before?: LabelData, after?: LabelData): string[] => {
  const keys = new Set([
    ...Object.keys(before ?? {}),
    ...Object.keys(after ?? {}),
  ]);
  const changed: string[] = [];

  for (const key of keys) {
    const a = (before as Record<string, unknown>)?.[key];
    const b = (after as Record<string, unknown>)?.[key];

    if (a === b || isEqual(a, b)) {
      continue;
    }

    changed.push(key);
  }

  return changed;
};

/** Terse, gesture-traceable description of one op. */
const describeOp = (op: UndoOp): string => {
  const where = `${op.ref.path}#${shortId(op.ref.instanceId)}`;

  if (op.before === undefined) {
    return `create ${where}`;
  }

  if (op.after === undefined) {
    return `delete ${where}`;
  }

  return `update ${where}[${changedKeys(op.before, op.after).join(",")}]`;
};

/**
 * Terse, gesture-traceable description of one entry; the undoKey prefixes when
 * present. Computed lazily by the command-stack entry so a coalesced merge is
 * reflected. Used for the undo/redo history tooltips.
 */
export const describeEntry = (entry: UndoEntry): string => {
  const body = entry.ops.map(describeOp).join(", ");
  return entry.undoKey ? `${entry.undoKey}: ${body}` : body;
};

/** Outcome of a push: the ledger entry (the prior unit when coalesced) + whether it merged. */
export interface UndoPushResult {
  entry: UndoEntry;
  coalesced: boolean;
}

export class UndoLedger {
  private entries: UndoEntry[] = [];

  /**
   * Record a committed transaction. Consecutive entries sharing an `undoKey`
   * merge into one unit (slider drags, streaming batches): the earlier `before`
   * wins, the later `after` wins. Returns the live unit (the prior one when
   * coalesced, mutated in place) so the command-stack entry that closed over it
   * reflects the merge.
   */
  push(entry: UndoEntry): UndoPushResult {
    const top = this.entries[this.entries.length - 1];

    if (!entry.undoKey || top?.undoKey !== entry.undoKey) {
      this.entries.push(entry);
      return { entry, coalesced: false };
    }

    for (const op of entry.ops) {
      const existing = top.ops.find((o) => refKey(o.ref) === refKey(op.ref));

      if (existing) {
        existing.after = op.after;
      } else {
        top.ops.push(op);
      }
    }

    return { entry: top, coalesced: true };
  }

  /** Drop a specific entry — await-and-rollback removes its own entry after applying it. */
  drop(entry: UndoEntry): void {
    this.entries = this.entries.filter((e) => e !== entry);
  }

  /** The most recently committed unit (await-and-rollback peeking). */
  peek(): UndoEntry | undefined {
    return this.entries[this.entries.length - 1];
  }

  /**
   * Store unregistration: drop every unit touching the departed sample and
   * return their ids. An entry goes whole — a mixed-sample transaction cannot
   * half-replay.
   */
  dropSample(sample: string): string[] {
    const dropped: string[] = [];

    this.entries = this.entries.filter((entry) => {
      const touches = entry.ops.some((op) => op.ref.sample === sample);

      if (touches) {
        dropped.push(entry.id);
      }

      return !touches;
    });

    return dropped;
  }
}
