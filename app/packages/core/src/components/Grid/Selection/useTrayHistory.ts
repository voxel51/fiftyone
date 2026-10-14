import {
  CommandContextManager,
  DelegatingUndoable,
  KnownContexts,
} from "@fiftyone/commands";
import {
  selectionDomainDataset,
  selectionMemberKey,
  useActiveSelectionBucket,
  useRestoreSelection,
  useSelectionBucketCaptures,
  useSelectionBuckets,
  type SelectionBoundary,
  type SelectionTraySnapshot,
} from "@fiftyone/state/src/selection";
import { useEffect, useMemo, useRef } from "react";

/** Where tray history applies: one view kind of one dataset, and its subset. */
export function trayHistoryScope(
  domainId: string,
  boundary: SelectionBoundary,
) {
  return JSON.stringify([domainId, boundary.subsetId, boundary.subsetScope]);
}

/**
 * What a step changes: sections and who is in them. Making a section active
 * is not a step, though a step puts back the active section it had; nor are
 * card details that load later.
 */
function stepKey(snapshot: SelectionTraySnapshot) {
  return JSON.stringify([
    snapshot.buckets.map(({ id, name, icon }) => [id, name, icon]),
    [...snapshot.captures].map(([id, captures]) => [
      id,
      [...captures.values()].map((group) => [
        group.episodeId,
        group.group?.fingerprint,
        group.members.map(selectionMemberKey),
      ]),
    ]),
  ]);
}

/** The grid's command context; its stack backs the bar's undo and ⌘Z. */
function gridContext() {
  return CommandContextManager.instance().getCommandContext(
    KnownContexts.Default,
  );
}

/**
 * Records every change to the tray as one undoable step on the grid's
 * command context, so the bar's undo and redo, and ⌘Z and ⇧⌘Z, step back and
 * forth through picks and section edits. Leaving the scope a step
 * happened in leaves its history behind, so an undo never restores old picks
 * over a fresh selection elsewhere. Only the tray pushes to that context, so
 * clearing it clears tray history alone.
 */
export function useTrayHistory(domainId: string, scope: string) {
  const buckets = useSelectionBuckets(selectionDomainDataset(domainId));
  const captures = useSelectionBucketCaptures(domainId);
  const { active } = useActiveSelectionBucket(domainId);
  const restore = useRestoreSelection(domainId);
  const snapshot = useMemo<SelectionTraySnapshot>(
    () => ({ buckets, captures, active }),
    [buckets, captures, active],
  );
  const key = useMemo(() => stepKey(snapshot), [snapshot]);
  const last = useRef<{
    scope: string;
    key: string;
    snapshot: SelectionTraySnapshot;
  } | null>(null);
  // The key a replay restores, so its own change is not recorded as a step.
  const replaying = useRef<string | null>(null);

  // This effect records each settled tray change as an undoable step, and
  // drops history when the scope it happened in is left.
  useEffect(() => {
    const previous = last.current;
    last.current = { scope, key, snapshot };
    if (!previous) return;
    if (previous.scope !== scope) {
      gridContext()?.clearUndoRedoStack();
      return;
    }
    if (previous.key === key) return;
    if (replaying.current === key) {
      replaying.current = null;
      return;
    }
    const replay = (target: SelectionTraySnapshot) => {
      replaying.current = stepKey(target);
      restore(target);
    };
    const before = previous.snapshot;
    gridContext()?.pushUndoable(
      new DelegatingUndoable(
        "fo.selection.tray",
        () => replay(snapshot),
        () => replay(before),
        () => "Selection change",
      ),
    );
  }, [scope, key, snapshot, restore]);

  // This effect drops tray history with the tray, so no step outlives the
  // dataset it changed.
  useEffect(() => () => gridContext()?.clearUndoRedoStack(), []);
}
