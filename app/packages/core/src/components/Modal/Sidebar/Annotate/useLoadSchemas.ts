import { useOperatorExecutor } from "@fiftyone/operators";
import { toCamelCase } from "@fiftyone/utilities";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { activeLabelSchemas, labelSchemasData } from "./state";

export default function useLoadSchemas() {
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const get = useOperatorExecutor("get_label_schemas");

  useEffect(() => {
    if (!get.result) {
      return;
    }

    // Convert snake_case from Python to camelCase for frontend
    setData(toCamelCase(get.result.label_schemas));
    setActive(get.result.active_label_schemas);
  }, [get.result, setData]);

  return useCallback(() => {
    get.execute({});
  }, []);
}
