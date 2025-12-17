import { useOperatorExecutor } from "@fiftyone/operators";
import { useSetAtom } from "jotai";
import { useCallback, useEffect } from "react";
import { schemaData } from "./SchemaManager/state";
import { fieldTypes, schemas } from "./state";

export default function useLoadSchemas() {
  const setSchema = useSetAtom(schemas);
  const setTypes = useSetAtom(fieldTypes);
  const setData = useSetAtom(schemaData);
  const get = useOperatorExecutor("get_label_schemas");

  useEffect(() => {
    if (!get.result) {
      return;
    }

    const types = {};

    const schemas = {};
    for (const path in get.result.label_schemas) {
      schemas[path] = get.result.label_schemas[path];
      types[path] = get.result.label_schemas[path].type;
    }

    setData(get.result.label_schemas);
    setSchema(schemas);
    setTypes(types);
  }, [get.result, setSchema, setTypes]);

  return useCallback(() => {
    get.execute({});
  }, []);
}
