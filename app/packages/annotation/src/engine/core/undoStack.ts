/**
 * The engine-owned undo stack: value-based transaction
 * inverses, captured per touched ref. Value-based (not transient restores) so
 * undo survives persistence — undoing an autosaved edit is a new, ordinary
 * transaction writing the before-values.
 *
 * Pure bookkeeping: applying an entry is the engine's job (a non-recording
 * replay transaction).
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

/** One undoable unit — a top-level transaction's touched refs. */
export interface UndoEntry {
  ops: UndoOp[];
  undoKey?: string;
}

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

/** One entry: its ops, prefixed by the gesture's undoKey when present. */
const describeEntry = (entry: UndoEntry): string => {
  const body = entry.ops.map(describeOp).join(", ");
  return entry.undoKey ? `${entry.undoKey}: ${body}` : body;
};

export class UndoStack {
  private undos: UndoEntry[] = [];
  private redos: UndoEntry[] = [];

  /**
   * Record a committed transaction. Consecutive entries sharing an `undoKey`
   * merge into one unit (slider drags, streaming batches): the earlier
   * `before` wins, the later `after` wins. Any push invalidates redo.
   */
  push(entry: UndoEntry): void {
    this.redos = [];
    const top = this.undos[this.undos.length - 1];

    if (!entry.undoKey || top?.undoKey !== entry.undoKey) {
      this.undos.push(entry);
      return;
    }

    for (const op of entry.ops) {
      const existing = top.ops.find((o) => refKey(o.ref) === refKey(op.ref));

      if (existing) {
        existing.after = op.after;
      } else {
        top.ops.push(op);
      }
    }
  }

  /** Pop the next undo unit, moving it to the redo side. */
  takeUndo(): UndoEntry | undefined {
    const entry = this.undos.pop();

    if (entry) {
      this.redos.push(entry);
    }

    return entry;
  }

  /** Pop the next redo unit, moving it back to the undo side. */
  takeRedo(): UndoEntry | undefined {
    const entry = this.redos.pop();

    if (entry) {
      this.undos.push(entry);
    }

    return entry;
  }

  /**
   * Drop a specific entry wherever it sits — rollback reuse: an
   * await-and-rollback persist failure applies the transaction's own entry
   * and removes it from history.
   */
  drop(entry: UndoEntry): void {
    this.undos = this.undos.filter((e) => e !== entry);
    this.redos = this.redos.filter((e) => e !== entry);
  }

  /** The most recently committed unit (rollback reuse). */
  peekUndo(): UndoEntry | undefined {
    return this.undos[this.undos.length - 1];
  }

  /**
   * Terse, gesture-traceable view of both stacks, NEWEST-FIRST (line 1 = the
   * next entry an undo/redo will apply). Backs the undo/redo history tooltips.
   */
  describe(): { undo: string[]; redo: string[] } {
    return {
      undo: [...this.undos].reverse().map(describeEntry),
      redo: [...this.redos].reverse().map(describeEntry),
    };
  }

  canUndo(): boolean {
    return this.undos.length > 0;
  }

  canRedo(): boolean {
    return this.redos.length > 0;
  }

  /** Whole-sample reset: history refers to entities that no longer exist. */
  clear(): void {
    this.undos = [];
    this.redos = [];
  }

  /**
   * Store unregistration: drop every unit touching the departed sample. An
   * entry goes whole — a mixed-sample transaction cannot half-replay.
   */
  dropSample(sample: string): void {
    const touches = (entry: UndoEntry) =>
      entry.ops.some((op) => op.ref.sample === sample);

    this.undos = this.undos.filter((entry) => !touches(entry));
    this.redos = this.redos.filter((entry) => !touches(entry));
  }
}
