/**
 * RJSF widget that wraps SchemaIO's AutocompleteView
 *
 * This provides the same autocomplete behavior (freeSolo, chips, multi-select)
 * in RJSF forms by reusing the existing SchemaIO implementation.
 */

import React from "react";
import { WidgetProps } from "@rjsf/utils";
import AutocompleteView from "../../../../../../core/src/plugins/SchemaIO/components/AutocompleteView";

export default function AutoComplete(props: WidgetProps) {
  const { value, onChange, schema, uiSchema, id, disabled, readonly, label } =
    props;

  // Extract choices from schema.examples or uiSchema
  const examples = schema.examples || [];
  const enumValues = schema.enum || examples;
  const enumNames = uiSchema?.["ui:enumNames"] || enumValues;

  // Build choices array in SchemaIO format
  const choices = enumValues.map((val: unknown, index: number) => ({
    value: val,
    label: (enumNames[index] ?? val) as string,
  }));

  const multiple = schema.type === "array";

  // Build SchemaIO-compatible schema
  const schemaIOSchema = {
    type: multiple ? "array" : "string",
    view: {
      name: "AutocompleteView",
      label: label || schema.title,
      placeholder: uiSchema?.["ui:placeholder"],
      readOnly: readonly || disabled,
      choices: choices,
      allow_user_input: uiSchema?.["ui:options"]?.freeSolo ?? true,
      allow_clearing: uiSchema?.["ui:options"]?.allowClear ?? true,
      allow_duplicates: uiSchema?.["ui:options"]?.allowDuplicates ?? false, // AutocompleteView creates a Material UI error if true
    },
  };

  const handleChange = (_path: string, newValue: unknown) => {
    onChange(newValue);
  };

  return (
    <AutocompleteView
      schema={schemaIOSchema}
      data={value}
      onChange={handleChange}
      path={id}
    />
  );
}
