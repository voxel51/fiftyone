/**
 * RJSF widget using only Voodo (FormField + Select).
 * Used for single- or multi-select fields in SmartForm.
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField, Select } from "@voxel51/voodo";
import React, { useCallback, useMemo } from "react";

function computeSelectChangeValue(
  newValue: string | string[],
  multiple: boolean,
  enumValues: unknown[]
): unknown {
  // Select uses string IDs for options; resolve back to the schema's original enum
  // value so we preserve type (e.g. number or boolean) for validation and downstream use.
  const resolveToEnumValue = (s: string) => {
    const original = enumValues.find((v) => String(v) === s);
    return original !== undefined ? original : s;
  };
  if (multiple) {
    const arr = Array.isArray(newValue) ? newValue : [newValue];
    return arr.map(resolveToEnumValue);
  }
  return resolveToEnumValue(
    typeof newValue === "string" ? newValue : newValue[0] ?? ""
  );
}

export default function SelectWidget(props: WidgetProps) {
  const { value, onChange, schema, uiSchema, disabled, readonly, label } =
    props;

  const enumValues = schema.enum || [];
  const enumNames = schema.enumNames || enumValues;

  const options = useMemo(
    () =>
      enumValues.map((val: unknown, index: number) => ({
        id: String(val),
        data: { label: String(enumNames[index] ?? val) },
      })),
    [enumValues, enumNames]
  );

  const multiple = schema.type === "array";
  const rawValue = value ?? (multiple ? [] : "");

  const selectValue = useMemo(() => {
    if (multiple && !Array.isArray(rawValue)) {
      return rawValue != null && rawValue !== ""
        ? String(rawValue)
            .split(",")
            .map((s) => s.trim())
        : [];
    }
    return rawValue;
  }, [multiple, rawValue]);

  const handleChange = useCallback(
    (newValue: string | string[] | null) => {
      if (newValue == null) {
        // no op, don't update select value
        return;
      }
      onChange(computeSelectChangeValue(newValue, multiple, enumValues));
    },
    [onChange, multiple, enumValues]
  );

  return (
    <FormField
      label={label || schema.title}
      control={
        <Select
          disabled={disabled || readonly}
          exclusive={!multiple}
          portal
          value={selectValue}
          onChange={handleChange}
          options={options}
        />
      }
    />
  );
}
