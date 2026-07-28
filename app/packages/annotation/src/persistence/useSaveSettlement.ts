import { useCallback, useEffect, useState } from "react";
import { useAnnotationEventHandler } from "../hooks";
import { useAnnotationEngine } from "../state";

/**
 * Whether every annotation edit has been persisted: no effective deltas are
 * pending and no persistence pass is in flight.
 *
 * Autosave is an interval tick ({@link useAutoSave}), so an edit is dirty for
 * up to one interval before its patch even starts — a consumer that needs
 * "this edit reached the database" (e.g. before navigating away, or an e2e
 * readiness seam) must wait for settlement, not for the edit's commit.
 *
 * Unsettles on the display-channel bump that carries an edit (the effective-
 * delta check runs only on the settled→unsettled transition, never
 * per-gesture-frame) and re-settles only on "annotation:persistenceSettled" —
 * a persistence pass that verified nothing is left to save.
 */
export const useSaveSettlement = (): boolean => {
  const engine = useAnnotationEngine();

  const hasEffectiveDeltas = useCallback(
    () => engine.getJsonPatch().some((entry) => entry.deltas.length > 0),
    [engine],
  );

  const [settled, setSettled] = useState(() => !hasEffectiveDeltas());

  useEffect(
    () =>
      engine.subscribe(() => {
        // only the settled→unsettled edge diffs; while unsettled (e.g. a
        // gesture streaming commits) bumps are ignored
        setSettled((current) => (current ? !hasEffectiveDeltas() : current));
      }),
    [engine, hasEffectiveDeltas],
  );

  useAnnotationEventHandler(
    "annotation:persistenceInFlight",
    useCallback(() => setSettled(false), []),
  );

  useAnnotationEventHandler(
    "annotation:persistenceSettled",
    useCallback(() => setSettled(true), []),
  );

  return settled;
};
