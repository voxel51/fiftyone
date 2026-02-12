import { useOperatorExecutor } from "@fiftyone/operators";
import { activeFields, ANNOTATE, EXPLORE, modalMode } from "@fiftyone/state";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useRef } from "react";
import { useRecoilCallback, useRecoilValue } from "recoil";
import {
  activeLabelSchemas,
  addToActiveSchemas,
  labelSchemasData,
  removeFromActiveSchemas,
} from "./Annotate/state";

/**
 * Keeps Explore (Recoil `activeFields`) and Annotate (Jotai `activeLabelSchemas`)
 * in sync for fields that have annotation schemas.
 *
 * Sync directions:
 * - Explore → Annotate: immediate sync when checkbox is toggled (includes operator calls)
 * - Annotate → Explore: deferred sync when switching from Annotate to Explore mode
 *
 * The deferred approach for Annotate → Explore prevents a race condition where
 * changing Recoil `activeFields` during Annotate mode would cause `pathMap` to
 * recompute, interrupting in-flight label loading in `useLabels` and leaving the
 * loading state stuck at LOADING.
 *
 * Only fields present in `labelSchemasData` are eligible for sync.
 */
const useFieldActivationSync = () => {
  const recoilFields = useRecoilValue(activeFields({ modal: true }));
  const jotaiSchemas = useAtomValue(activeLabelSchemas);
  const schemasData = useAtomValue(labelSchemasData);
  const mode = useAtomValue(modalMode);

  const setRecoilFields = useRecoilCallback(
    ({ set }) =>
      (fields: string[]) => {
        set(activeFields({ modal: true }), fields);
      },
    []
  );

  const addSchemas = useSetAtom(addToActiveSchemas);
  const removeSchemas = useSetAtom(removeFromActiveSchemas);

  const activateOperator = useOperatorExecutor("activate_label_schemas");
  const deactivateOperator = useOperatorExecutor("deactivate_label_schemas");

  const prevRecoilRef = useRef<string[] | null>(null);
  const prevModeRef = useRef(mode);
  const initializedRef = useRef(false);
  const skipNextRecoilSyncRef = useRef(false);

  const schemaFields = useMemo(
    () => new Set(Object.keys(schemasData ?? {})),
    [schemasData]
  );

  // Record initial Recoil state when schemas become available
  useEffect(() => {
    if (initializedRef.current) return;
    if (schemasData && jotaiSchemas !== null) {
      prevRecoilRef.current = recoilFields;
      initializedRef.current = true;
    }
  }, [schemasData, jotaiSchemas, recoilFields]);

  // Recoil → Jotai sync (immediate, for Explore checkbox toggles)
  useEffect(() => {
    if (!initializedRef.current || !schemasData) return;

    if (skipNextRecoilSyncRef.current) {
      skipNextRecoilSyncRef.current = false;
      prevRecoilRef.current = recoilFields;
      return;
    }

    const prev = prevRecoilRef.current;
    prevRecoilRef.current = recoilFields;

    if (!prev) return;

    const prevSet = new Set(prev.filter((f) => schemaFields.has(f)));
    const currSet = new Set(recoilFields.filter((f) => schemaFields.has(f)));

    const added = [...currSet].filter((f) => !prevSet.has(f));
    const removed = [...prevSet].filter((f) => !currSet.has(f));

    if (added.length === 0 && removed.length === 0) return;

    if (added.length > 0) {
      addSchemas(new Set(added));
      activateOperator.execute({ fields: added });
    }
    if (removed.length > 0) {
      removeSchemas(new Set(removed));
      deactivateOperator.execute({ fields: removed });
    }
  }, [
    recoilFields,
    schemasData,
    schemaFields,
    addSchemas,
    removeSchemas,
    activateOperator,
    deactivateOperator,
  ]);

  // Jotai → Recoil sync (deferred to Annotate → Explore mode switch)
  useEffect(() => {
    const prevMode = prevModeRef.current;
    prevModeRef.current = mode;

    if (prevMode !== ANNOTATE || mode !== EXPLORE) return;
    if (!schemasData || jotaiSchemas === null) return;

    const jotaiActive = new Set(
      jotaiSchemas.filter((f) => schemaFields.has(f))
    );

    const recoilSet = new Set(recoilFields);
    for (const f of schemaFields) {
      if (jotaiActive.has(f)) {
        recoilSet.add(f);
      } else {
        recoilSet.delete(f);
      }
    }

    setRecoilFields([...recoilSet]);
    skipNextRecoilSyncRef.current = true;
  }, [
    mode,
    schemasData,
    jotaiSchemas,
    recoilFields,
    schemaFields,
    setRecoilFields,
  ]);
};

export default useFieldActivationSync;
