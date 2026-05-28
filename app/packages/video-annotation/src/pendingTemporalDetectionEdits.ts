import { atom, useAtomValue, useSetAtom } from "jotai";
import { useCallback } from "react";
import type { RawTemporalDetectionsField } from "./temporalDetectionTracks";

/**
 * Pending edits to `TemporalDetection.support` made through the timeline's
 * interval drag handles. Keyed by `${fieldPath}|${detectionId}` so a
 * given TD has at most one outstanding staged edit; later drags overwrite
 * earlier ones.
 *
 * Two roles:
 *   1. Optimistic display — {@link FrameLabelsTracks} reads this and
 *      overlays staged support values onto the sample-derived TD list
 *      before building tracks, so the bar stays where the user dropped
 *      it through the server round-trip.
 *   2. Delta source — `useTemporalDetectionDeltaSupplier` walks the map
 *      and emits one `replace /<fieldPath>/detections/<index>/support`
 *      patch op per pending edit on the next autosave tick.
 *
 * Cleared on `annotation:persistenceSuccess` and
 * `annotation:persistenceError` by {@link useRegisterVideoAnnotationEventHandlers}.
 */
const pendingTemporalDetectionEditsAtom = atom<
  ReadonlyMap<string, [number, number]>
>(new Map());

export const temporalDetectionEditKey = (
  fieldPath: string,
  detectionId: string
): string => `${fieldPath}|${detectionId}`;

export const parseTemporalDetectionEditKey = (
  key: string
): { fieldPath: string; detectionId: string } => {
  const sep = key.indexOf("|");
  return {
    fieldPath: key.slice(0, sep),
    detectionId: key.slice(sep + 1),
  };
};

/**
 * Reactive view of all currently-pending TD support edits.
 */
export const useTemporalDetectionPendingEdits = (): ReadonlyMap<
  string,
  [number, number]
> => useAtomValue(pendingTemporalDetectionEditsAtom);

/**
 * Stage (or overwrite) a `support` edit for a single TD. The next
 * autosave tick will turn it into a JSON-Patch op via the delta supplier.
 */
export const useStageTemporalDetectionSupport = (): ((
  fieldPath: string,
  detectionId: string,
  support: [number, number]
) => void) => {
  const set = useSetAtom(pendingTemporalDetectionEditsAtom);

  return useCallback(
    (fieldPath, detectionId, support) => {
      set((prev) => {
        const next = new Map(prev);
        next.set(temporalDetectionEditKey(fieldPath, detectionId), support);

        return next;
      });
    },
    [set]
  );
};

/**
 * Clear every staged TD support edit. Called by the persistence event
 * handler on both success (sample is about to refresh with the new
 * values) and error (revert the optimistic visual; user can re-drag).
 */
export const useClearTemporalDetectionEdits = (): (() => void) => {
  const set = useSetAtom(pendingTemporalDetectionEditsAtom);

  return useCallback(() => {
    set(new Map());
  }, [set]);
};

/**
 * Return a shallow-cloned copy of `sample` with staged TD support edits
 * applied to the matching detections. Top-level fields and the
 * `detections` array of any field touched by an edit are cloned; the
 * untouched fields stay referentially stable. Edits whose field /
 * detection no longer exist on the sample are silently skipped.
 */
export const applyTemporalDetectionEdits = (
  sample: Record<string, unknown>,
  edits: ReadonlyMap<string, [number, number]>
): Record<string, unknown> => {
  if (edits.size === 0) {
    return sample;
  }

  // Group by field path so we clone each `detections` array at most once
  // even when multiple TDs in the same field have pending edits.
  const editsByField = new Map<string, Map<string, [number, number]>>();
  for (const [key, support] of edits) {
    const { fieldPath, detectionId } = parseTemporalDetectionEditKey(key);
    let fieldEdits = editsByField.get(fieldPath);
    if (!fieldEdits) {
      fieldEdits = new Map();
      editsByField.set(fieldPath, fieldEdits);
    }

    fieldEdits.set(detectionId, support);
  }

  const next = { ...sample };
  for (const [fieldPath, fieldEdits] of editsByField) {
    const field = next[fieldPath] as RawTemporalDetectionsField | undefined;
    const detections = field?.detections;
    if (!Array.isArray(detections)) {
      continue;
    }

    next[fieldPath] = {
      ...field,
      detections: detections.map((d) => {
        const id = d._id ?? d.id;
        const support = id ? fieldEdits.get(id) : undefined;
        return support ? { ...d, support } : d;
      }),
    };
  }

  return next;
};
