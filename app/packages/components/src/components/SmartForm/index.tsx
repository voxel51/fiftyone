import React from "react";
import RJSF from "./RJSF";

import type { RJSFSchema, UiSchema, ValidatorType } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export interface SmartFormProps {
  schema?: SchemaType;
  jsonSchema?: RJSFSchema;
  uiSchema?: UiSchema;
  data?: unknown;
  onChange?: (data: unknown) => void;
  onSubmit?: (data: unknown) => void;
  validator?: ValidatorType;
  liveValidate?: boolean;
}

export default function SmartForm(props: SmartFormProps) {
  // potentially support RJSF alternatives here
  return <RJSF {...props} />;
}
