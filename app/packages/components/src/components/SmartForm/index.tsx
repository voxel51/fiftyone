import React from "react";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";

import {
  convertRJSFDataToSchemaIO,
  translateSchemaComplete,
} from "./translators";

import widgets from "./widgets";
import templates from "./templates";

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
    formData,
  } = translateSchemaComplete(props.schema, props.data);

  const mergedUiSchema = { ...generatedUiSchema, ...props.uiSchema };

  // console.log("[SchemaIO]", props.schema);
  // console.log("[JSON Schema]", jsonSchema);
  // console.log("[UI Schema]", generatedUiSchema);
  // console.log("[Data]", props.data);

  if (warnings.length > 0) {
    console.warn("[SmartForm] Schema translation warnings:", warnings);
  }

  const handleChange = (event: IChangeEvent, _id?: string) => {
    if (props.onChange) {
      const schemaIOData = convertRJSFDataToSchemaIO(
        event.formData,
        props.schema
      );

      props.onChange(schemaIOData);
    }
  };

  const handleSubmit = (event: IChangeEvent, _nativeEvent: React.FormEvent) => {
    if (props.onSubmit) {
      const schemaIOData = convertRJSFDataToSchemaIO(
        event.formData,
        props.schema
      );

      props.onSubmit(schemaIOData);
    }
  };

  return (
    <Form
      schema={jsonSchema}
      uiSchema={mergedUiSchema}
      validator={props.validator || validator}
      widgets={widgets}
      templates={templates}
      formData={formData}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
}
