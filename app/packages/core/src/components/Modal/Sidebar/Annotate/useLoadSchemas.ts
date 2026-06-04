import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
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

  useEffect(() => {
    if (!get.result) {
      return;
    }
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData, setActive]);

  // `get.execute` identity can change across renders (its
  // `useRecoilCallback` deps include `currentSample` / `context`).
  // Mirror it through a ref so the returned callback uses the latest
  // `execute` without churning its own identity — Sidebar.tsx consumes
  // this callback as an effect dep.
  const executeRef = useRef(get.execute);
  executeRef.current = get.execute;

  // Refetch without pre-clearing the schema atoms: the `get.result`
  // effect above swaps them atomically once the response lands, so
  // consumers (`useLabels`, `useFocus.selectOverlay`'s `labelMap`
  // lookup) never see a transient null mid-refetch.
  return useCallback(() => {
    setActivePathsOrder(null);
    closeSchemaManager();
    executeRef.current({});
  }, [setActivePathsOrder, closeSchemaManager]);
}
