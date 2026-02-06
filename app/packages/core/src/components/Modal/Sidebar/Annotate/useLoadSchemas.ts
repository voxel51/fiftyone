import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import {
  activeLabelSchemas,
  activePathsOrder,
  currentField,
  labelSchemasData,
  showModal,
} from "./state";
import {
  draftJsonContent,
  jsonValidationErrors,
  selectedActiveFields,
  selectedHiddenFields,
} from "./SchemaManager/state";

export default function useLoadSchemas() {
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const setCurrentField = useSetAtom(currentField);
  const setActivePathsOrder = useSetAtom(activePathsOrder);
  const setShowModal = useSetAtom(showModal);
  const setSelectedActiveFields = useSetAtom(selectedActiveFields);
  const setSelectedHiddenFields = useSetAtom(selectedHiddenFields);
  const setDraftJsonContent = useSetAtom(draftJsonContent);
  const setJsonValidationErrors = useSetAtom(jsonValidationErrors);
  const get = useOperatorExecutor("get_label_schemas");

  useEffect(() => {
    if (!get.result) {
      return;
    }

    // Set new schema data
    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData, setActive]);

  // Reset UI state and fetch new data
  return useCallback(() => {
    // Reset schema data to trigger loading state
    setData(null);
    setActive(null);

    // Reset UI state immediately when loading new schemas
    setCurrentField(null);
    setActivePathsOrder(null);
    setShowModal(false);
    setSelectedActiveFields(new Set());
    setSelectedHiddenFields(new Set());
    setDraftJsonContent(null);
    setJsonValidationErrors([]);

    get.execute({});
  }, [
    setData,
    setActive,
    setCurrentField,
    setActivePathsOrder,
    setShowModal,
    setSelectedActiveFields,
    setSelectedHiddenFields,
    setDraftJsonContent,
    setJsonValidationErrors,
  ]);
}
