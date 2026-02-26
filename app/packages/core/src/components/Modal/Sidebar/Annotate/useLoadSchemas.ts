import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
import { useCallback, useEffect, useRef } from "react";
import {
  activeLabelSchemas,
  activePathsOrder,
  labelSchemasData,
  showModal,
} from "./state";

export default function useLoadSchemas() {
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const setActivePathsOrder = useSetAtom(activePathsOrder);
  const setShowModal = useSetAtom(showModal);
  const get = useOperatorExecutor("get_label_schemas");

  // Keep a stable ref to get.execute so the callback below always calls
  // the latest version without needing get.execute in its dependency array.
  const executeRef = useRef(get.execute);
  executeRef.current = get.execute;

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
    // Reset schema data to trigger loading state
    setData(null);
    setActive(null);

    // Reset paths order and close modal
    setActivePathsOrder(null);
    setShowModal(false);

    executeRef.current({});
  }, [setData, setActive, setActivePathsOrder, setShowModal]);
}
