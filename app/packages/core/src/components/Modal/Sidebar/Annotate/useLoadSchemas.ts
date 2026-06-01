import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
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

  // Atomically swap in the new schema once the fetch resolves. We do
  // NOT clear `labelSchemasData` / `activeLabelSchemas` first — the
  // prior schema stays visible during the in-flight window so
  // downstream consumers (`useLabels`, `useFocus.selectOverlay`'s
  // `labelMap` lookup, the `fieldsOfType(...)` reads behind
  // classification activation) never see a transient null. The pre-clear
  // was removed in #7288 to fix a loading-screen flicker; this also
  // removes a brief null window that flaked classification activation
  // when the user clicked a chip mid-refetch.
  useEffect(() => {
    if (!get.result) {
      return;
    }
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData, setActive]);

  // Trigger a fresh fetch. The `get.result` effect above swaps the
  // atoms atomically when the response lands. SchemaManager UI state
  // (currentField, selection, JSON editor) is reset on its modal
  // unmount via `useSchemaManagerCleanup`.
  return useCallback(() => {
    setActivePathsOrder(null);
    closeSchemaManager();
    get.execute({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
