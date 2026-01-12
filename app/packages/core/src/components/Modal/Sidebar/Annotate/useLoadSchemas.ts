import { useOperatorExecutor } from "@fiftyone/operators";
import { toCamelCase } from "@fiftyone/utilities";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { activeLabelSchemas, labelSchemasData } from "./state";

// Convert property names to camelCase while preserving field names (top-level keys)
const convertLabelSchemas = (schemas: Record<string, any>) => {
  const result: Record<string, any> = {};
  for (const fieldName in schemas) {
    // Preserve field name, only convert the properties within
    result[fieldName] = toCamelCase(schemas[fieldName]);
  }
  return result;
};

export default function useLoadSchemas() {
  const setData = useSetAtom(labelSchemasData);
  const setActive = useSetAtom(activeLabelSchemas);
  const get = useOperatorExecutor("get_label_schemas");

  useEffect(() => {
    if (!get.result) {
      return;
    }

    // Convert property names to camelCase while preserving field names
    setData(convertLabelSchemas(get.result.label_schemas));
    setActive(get.result.active_label_schemas);
  }, [get.result, setData]);

  return useCallback(() => {
    get.execute({});
  }, []);
}
