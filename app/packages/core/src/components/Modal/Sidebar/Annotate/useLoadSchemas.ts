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

    setData(get.result.label_schemas);
    setActive(get.result.active_label_schemas);
  }, [get.result, setData]);

  return useCallback(() => {
    get.execute({});
  }, []);
}
