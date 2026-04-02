import { useOperatorExecutor } from "@fiftyone/operators";
import { useCallback, useEffect } from "react";
import { useDispatch } from "react-redux";
import {
  setActiveSchemas,
  setLabelSchemasData,
} from "./redux/annotationSlice";
import { useSchemaManagerModal } from "./SchemaManager/hooks";

export default function useLoadSchemas() {
  const { closeSchemaManager } = useSchemaManagerModal();
  const get = useOperatorExecutor("get_label_schemas");
  const dispatch = useDispatch();

  useEffect(() => {
    if (!get.result) {
      return;
    }

    dispatch(setLabelSchemasData(get.result.label_schemas));
    dispatch(setActiveSchemas(get.result.active_label_schemas ?? []));
  }, [get.result, dispatch]);

  return useCallback(() => {
    dispatch(setLabelSchemasData(null));
    dispatch(setActiveSchemas([]));
    closeSchemaManager();
    get.execute({});
  }, []);
}
