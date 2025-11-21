import React from "react";
import { SchemaIOComponent } from "@fiftyone/core/src/plugins/SchemaIO";
import RJSF, { type RJSFProps } from "./RJSF";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import type { RJSFSchema } from "@rjsf/utils";

export { isSchemaIOSchema, isJSONSchema } from "./RJSF/translators";

export interface SmartFormProps {
  schema: SchemaType | RJSFSchema;
  data?: unknown;
  id?: string;
  useSchemaIO?: boolean;
  onChange?: (data: unknown, liteValues?: Record<string, unknown>) => void;

  // SchemaIO only
  shouldClearUseKeyStores?: boolean;
  onPathChange?: (
    path: string,
    value: unknown,
    schema?: SchemaType,
    updatedState?: unknown,
    liteValue?: unknown
  ) => void;

  // RJSF only
  onSubmit?: (data: unknown) => void;
  uiSchema?: RJSFProps["uiSchema"];
  validator?: RJSFProps["validator"];
}

export default function SmartForm(props: SmartFormProps) {
  return props.useSchemaIO ? (
    <SchemaIOComponent {...props} />
  ) : (
    <RJSF {...props} schema={props.schema as SchemaType} />
  );
}
