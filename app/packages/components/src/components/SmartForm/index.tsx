import React from "react";
import Form from "@rjsf/mui";
import validator from "@rjsf/validator-ajv8";
import type { IChangeEvent } from "@rjsf/core";
import type { ValidatorType, UiSchema } from "@rjsf/utils";
import type { SchemaType } from "@fiftyone/core/src/plugins/SchemaIO/utils/types";
import {
  convertSchemaIODataToRJSF,
  convertRJSFDataToSchemaIO,
  translateSchemaComplete,
} from "./schemaTranslator";

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

  // Log any translation warnings
  if (warnings.length > 0) {
    console.warn("[SmartForm] Schema translation warnings:", warnings);
  }

  // Convert SchemaIO data to RJSF format
  const formData = props.data
    ? convertSchemaIODataToRJSF(props.data, props.schema)
    : undefined;

  // Merge provided uiSchema with generated uiSchema (provided takes precedence)
  const mergedUiSchema = { ...generatedUiSchema, ...props.uiSchema };

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
      formData={formData}
      onChange={handleChange}
      onSubmit={handleSubmit}
    />
  );
}
