/**
 * The engine-owned undo stack (spec §5.2 / D7): value-based transaction
 * inverses, captured per touched ref. Value-based (not transient restores) so
 * undo survives persistence — undoing an autosaved edit is a new, ordinary
 * transaction writing the before-values.
 *
 * Pure bookkeeping: applying an entry is the engine's job (a non-recording
 * replay transaction).
 */

import type { LabelData } from "@fiftyone/utilities";

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
   * Drop a specific entry wherever it sits — rollback reuse (§9): an
   * await-and-rollback persist failure applies the transaction's own entry
   * and removes it from history.
   */
  drop(entry: UndoEntry): void {
    this.undos = this.undos.filter((e) => e !== entry);
    this.redos = this.redos.filter((e) => e !== entry);
  }

  /** The most recently committed unit (rollback reuse, §9). */
  peekUndo(): UndoEntry | undefined {
    return this.undos[this.undos.length - 1];
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
}
