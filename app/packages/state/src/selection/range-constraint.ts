import { atom, getDefaultStore, useAtomValue } from "jotai";
import { combineSelectionCaptures } from "./client";
import type { SegmentConstraint, SelectionMember } from "./types";

interface RangeConstraint {
  readonly datasetName: string;
  readonly provider: SegmentConstraint;
  readonly pending?: boolean;
  readonly retry?: () => void;
  readonly error?: string;
}

interface RangeCapture {
  readonly datasetId: string;
  readonly datasetName: string;
  readonly label: string;
  readonly members: readonly SelectionMember[];
  readonly error?: string;
}

const constraintAtom = atom<{ value: RangeConstraint | null }>({ value: null });
let pendingCapture: AbortController | null = null;

function publish(value: RangeConstraint | null) {
  getDefaultStore().set(constraintAtom, { value });
}

/** Upload bounded batches once; grid requests carry only the frozen reference. */
async function captureRanges(capture: RangeCapture, signal: AbortSignal) {
  const snapshotIds: string[] = [];
  for (let offset = 0; offset < capture.members.length; offset += 1000) {
    signal.throwIfAborted();
    const snapshot = await combineSelectionCaptures(
      capture.datasetId,
      {
        members: capture.members.slice(offset, offset + 1000),
        snapshotIds: [],
        view: [],
        transient: true,
      },
      signal,
    );
    snapshotIds.push(snapshot.snapshotId);
  }
  signal.throwIfAborted();
  if (snapshotIds.length === 1) return snapshotIds[0];
  const snapshot = await combineSelectionCaptures(
    capture.datasetId,
    { members: [], snapshotIds, view: [], transient: true },
    signal,
  );
  return snapshot.snapshotId;
}

/** Extensions publish alongside their filter commit, including reset/unmount. */
export const selectionRangeConstraintBridge = {
  reset() {
    pendingCapture?.abort();
    pendingCapture = null;
    publish(null);
  },
  capture(capture: RangeCapture) {
    pendingCapture?.abort();
    const controller = new AbortController();
    pendingCapture = controller;
    const empty: RangeConstraint = {
      datasetName: capture.datasetName,
      provider: { kind: "ranges", label: capture.label, members: [] },
      error: capture.error,
    };
    if (capture.error || !capture.members.length) {
      publish(empty);
      return;
    }
    publish({ ...empty, pending: true });
    void captureRanges(capture, controller.signal).then(
      (snapshotId) => {
        if (controller.signal.aborted) return;
        publish({
          datasetName: capture.datasetName,
          provider: { kind: "snapshot", snapshotId, label: capture.label },
          retry: () => selectionRangeConstraintBridge.capture(capture),
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        publish({
          ...empty,
          retry: () => selectionRangeConstraintBridge.capture(capture),
          error:
            error instanceof Error
              ? error.message
              : "Could not capture selected segments",
        });
      },
    );
  },
};

/** A late result from another dataset must never constrain this grid. */
export function useSelectionRangeConstraint(datasetName: string | null) {
  const { value } = useAtomValue(constraintAtom);
  return value?.datasetName === datasetName ? value : undefined;
}
