/**
 * RJSF widget that wraps SchemaIO's DropdownView
 *
 * Experienced issues getting options to manifest in RJSF dropdown
 * so wrapping SchemaIO's for the time being.
 *
 * This provides the same dropdown behavior in RJSF forms by reusing
 * the existing SchemaIO implementation.
 */

import { WidgetProps } from "@rjsf/utils";
import DropdownView from "../../../../../core/src/plugins/SchemaIO/components/DropdownView";

export default function Dropdown(props: WidgetProps) {
  const { value, onChange, schema, uiSchema, id, disabled, readonly, label } =
    props;

  // Extract choices from schema.enum/enumNames
  const enumValues = schema.enum || [];
  const enumNames = schema.enumNames || enumValues;

  // Build choices array in SchemaIO format
  const choices = enumValues.map((val: any, index: number) => ({
    value: val,
    label: enumNames[index] || val,
  }));

  const multiple = schema.type === "array";

  // Build SchemaIO-compatible schema
  const schemaIOSchema = {
    type: multiple ? "array" : "string",
    view: {
      name: "DropdownView",
      label: label || schema.title,
      placeholder: uiSchema?.["ui:placeholder"],
      readOnly: readonly || disabled,
      choices: choices,
      multiple: multiple || uiSchema?.["ui:options"]?.multiple,
      compact: uiSchema?.["ui:options"]?.compact,
      color: uiSchema?.["ui:options"]?.color,
      variant: uiSchema?.["ui:options"]?.variant,
    },
  };

  const handleChange = (path: string, newValue: any) => {
    onChange(newValue);
  };

  return (
    <DropdownView
      schema={schemaIOSchema}
      data={value}
      onChange={handleChange}
      path={id}
    />
  );
}
