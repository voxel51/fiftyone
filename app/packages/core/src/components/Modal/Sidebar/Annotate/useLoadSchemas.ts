import { useOperatorExecutor } from "@fiftyone/operators";
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

    const result = get.result as any;
    console.log("get.result", result);
    console.log("active_label_schemas", result.active_label_schemas);
    console.log("label_schemas keys", Object.keys(result.label_schemas || {}));

    // Ensure bool1 is in ground_truth's label_schema.attributes if it's in active schemas
    const labelSchemas = { ...(result.label_schemas || {}) };
    const activeSchemas = result.active_label_schemas || [];

    if (activeSchemas.includes("bool1") && labelSchemas.ground_truth) {
      const groundTruth = { ...labelSchemas.ground_truth };

      // Ensure label_schema exists
      if (!groundTruth.label_schema) {
        groundTruth.label_schema = {};
      }

      // Ensure attributes exists
      if (!groundTruth.label_schema.attributes) {
        groundTruth.label_schema.attributes = {};
      }

      // Add bool1 if it's missing
      if (!groundTruth.label_schema.attributes.bool1) {
        groundTruth.label_schema.attributes.bool1 = {
          component: "checkbox",
          ftype: "bool",
        };
        console.log("Added bool1 to ground_truth.label_schema.attributes");
      }

      labelSchemas.ground_truth = groundTruth;
    }

    setData(labelSchemas);
    setActive(result.active_label_schemas);
  }, [get.result, setData, setActive]);

  return useCallback(() => {
    get.execute({});
  }, []);
}
