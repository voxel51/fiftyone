import type { AnnotationEngine } from "@fiftyone/annotation";
import { describeEntry } from "@fiftyone/annotation";
import type { CommandContext } from "@fiftyone/commands";
import { DelegatingUndoable } from "@fiftyone/commands";

export interface EngineUndoableBinding {
  engine: AnnotationEngine;
  context: CommandContext;
}

/**
 * Pushes each committed engine transaction onto the command stack as an
 * entry-addressed undoable. A coalesced commit needs no push — the undoable
 * already on the stack closed over the same (now-merged) entry. Returns the
 * unsubscribe.
 */
export const bindEngineCommits = ({
  engine,
  context,
}: EngineUndoableBinding): (() => void) =>
  engine.subscribeUndoableCommit((entry, coalesced) => {
    if (coalesced) {
      return;
    }

    context.pushUndoable(
      new DelegatingUndoable(
        entry.id,
        () => engine.applyRedo(entry),
        () => engine.applyUndo(entry),
        () => describeEntry(entry)
      )
    );
  });

/**
 * Prunes undoables whose entries left the engine ledger (await-and-rollback,
 * store unregister) so the command stack never replays a dropped entry. Returns
 * the unsubscribe.
 */
export const bindEngineDrops = ({
  engine,
  context,
}: EngineUndoableBinding): (() => void) =>
  engine.subscribeUndoableDrop((ids) => {
    const dropped = new Set(ids);
    context.pruneUndoables((undoable) => dropped.has(undoable.id));
  });
