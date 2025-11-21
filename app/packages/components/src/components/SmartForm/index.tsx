import React from "react";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";

import { translateSchemaComplete } from "./translators";

import widgets from "./widgets";
import templates from "./templates";

export { isSchemaIOSchema, isJSONSchema } from "./translators";

import type { IChangeEvent } from "@rjsf/core";
import type { ValidatorType, UiSchema } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";

export interface SmartFormProps {
  schema: SchemaType;
  data?: unknown;
  uiSchema?: UiSchema;
  validator?: ValidatorType;
  onChange?: (data: unknown) => void;
  onSubmit?: (data: unknown) => void;
}

export default function SmartForm(props: SmartFormProps) {
  const {
    schema: jsonSchema,
    uiSchema: generatedUiSchema,
    warnings,
  } = translateSchemaComplete(props.schema);

  const mergedUiSchema = { ...generatedUiSchema, ...props.uiSchema };

  if (warnings.length > 0) {
    console.warn("[SmartForm] Schema translation warnings:", warnings);
  }

  const handleChange = (event: IChangeEvent, _id?: string) => {
    if (props.onChange) {
      props.onChange(event.formData);
    }
  };

  const handleSubmit = (event: IChangeEvent, _nativeEvent: React.FormEvent) => {
    if (props.onSubmit) {
      props.onSubmit(event.formData);
    }
  };

  return (
    <Form
      schema={jsonSchema}
      uiSchema={mergedUiSchema}
      validator={props.validator || validator}
      widgets={widgets}
      templates={templates}
      formData={props.data}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
}
