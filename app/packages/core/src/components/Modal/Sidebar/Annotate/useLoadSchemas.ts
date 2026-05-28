import { useOperatorExecutor } from "@fiftyone/operators";
import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import { useSchemaManagerModal } from "./SchemaManager/hooks";
import {
  activeLabelSchemas,
  activePathsOrder,
  labelSchemasData,
} from "./state";

export default function useLoadSchemas() {
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const setActivePathsOrder = useSetAtom(activePathsOrder);
  const { closeSchemaManager } = useSchemaManagerModal();
  const get = useOperatorExecutor("get_label_schemas");

  const schemasData = useAtomValue(labelSchemasData);
  const schemasDataRef = useRef(schemasData);
  schemasDataRef.current = schemasData;

  useEffect(() => {
    if (!get.result) {
      return;
    }

    // Set new schema data
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData, setActive]);

  // Reset schema data and close modal, then fetch new data
  // Note: UI state (currentField, selection, JSON editor) is reset on
  // SchemaManager Modal unmount via useSchemaManagerCleanup hook
  return useCallback(() => {
    // Skip the reset-then-refetch when the atom is already populated by
    // `useEnsureSchemasLoaded` — the brief null window flakes click handlers
    // that read `fieldsOfType(...)` (e.g. classification activation).
    if (schemasDataRef.current !== null) return;

    // Reset schema data to trigger loading state
    setData(null);
    setActive(null);

    // Reset paths order and close modal
    setActivePathsOrder(null);
    closeSchemaManager();

    get.execute({});
  }, []);
}
