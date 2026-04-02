import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import {
  setActiveSchemas,
  setLabelSchemasData,
} from "./redux/annotationSlice";
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
  const dispatch = useDispatch();

  useEffect(() => {
    if (!get.result) {
      return;
    }

    // Set new schema data — write to both Jotai (for remaining consumers) and Redux
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
    dispatch(setLabelSchemasData(get.result.label_schemas));
    dispatch(setActiveSchemas(get.result.active_label_schemas ?? []));
  }, [get.result, setData, setActive, dispatch]);

  // Reset schema data and close modal, then fetch new data
  // Note: UI state (currentField, selection, JSON editor) is reset on
  // SchemaManager Modal unmount via useSchemaManagerCleanup hook
  return useCallback(() => {
    // Reset schema data to trigger loading state
    setData(null);
    setActive(null);
    dispatch(setLabelSchemasData(null));
    dispatch(setActiveSchemas([]));

    // Reset paths order and close modal
    setActivePathsOrder(null);
    closeSchemaManager();

    get.execute({});
  }, []);
}
