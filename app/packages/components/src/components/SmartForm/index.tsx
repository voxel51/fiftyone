import React from "react";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";

import {
  convertSchemaIODataToRJSF,
  convertRJSFDataToSchemaIO,
  translateSchemaComplete,
} from "./schemaTranslator";

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
  // Translate SchemaIO schema to JSON Schema and UI Schema
  const {
    schema: jsonSchema,
    uiSchema: generatedUiSchema,
    warnings,
  } = translateSchemaComplete(props.schema);

  // Convert SchemaIO data to RJSF format
  const formData = props.data
    ? convertSchemaIODataToRJSF(props.data, props.schema)
    : undefined;

  // Merge provided uiSchema with generated uiSchema (provided takes precedence)
  const mergedUiSchema = { ...generatedUiSchema, ...props.uiSchema };

  console.log("[SchemaIO]", props.schema);
  console.log("[JSON Schema]", jsonSchema);
  console.log("[UI Schema]", generatedUiSchema);
  console.log("[Data]", props.data);

  // Log any translation warnings
  if (warnings.length > 0) {
    console.warn("[SmartForm] Schema translation warnings:", warnings);
  }

  const handleChange = (event: IChangeEvent, _id?: string) => {
    if (!event) return;

    console.log("[RJSF Change]", event.formData);
    if (props.onChange) {
      // Convert RJSF data back to SchemaIO format
      const schemaIOData = convertRJSFDataToSchemaIO(
        event.formData,
        props.schema
      );
      props.onChange(schemaIOData);
    }
  };

  const handleSubmit = (event: IChangeEvent, _nativeEvent: React.FormEvent) => {
    if (!event) return;

    console.log("[RJSF Submit]", event.formData);
    if (props.onSubmit) {
      // Convert RJSF data back to SchemaIO format
      const schemaIOData = convertRJSFDataToSchemaIO(
        event.formData,
        props.schema
      );
      props.onSubmit(schemaIOData);
    } else if (props.onChange) {
      // Fallback to onChange if onSubmit is not provided
      const schemaIOData = convertRJSFDataToSchemaIO(
        event.formData,
        props.schema
      );
      props.onChange(schemaIOData);
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
