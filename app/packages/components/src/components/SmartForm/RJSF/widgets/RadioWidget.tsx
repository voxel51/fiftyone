/**
 * Radio widget that manages its own label
 * Uses Voodoo's RadioGroup component for radio button selection
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField, RadioGroup, Size } from "@voxel51/voodo";
import React, { useMemo } from "react";

export default function RadioWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    onChange = () => {},
    schema,
    rawErrors = [],
    id,
  } = props;

  // Extract choices from schema.enum/enumNames
  const enumValues = schema.enum || [];
  const enumNames = schema.enumNames || enumValues;

  // Build options array in RadioGroup format
  const options = useMemo(
    () =>
      enumValues.map((val: unknown, index: number) => ({
        value: String(val),
        label: String(enumNames[index] || val),
      })),
    [schema?.enum, schema?.enumNames]
  );
  const isDisabled = disabled || readonly;

  const handleChange = (newValue: string) => {
    if (isDisabled) {
      return;
    }

    // Convert back to original type if needed (number, etc.)
    const originalValue = enumValues.find((v) => String(v) === newValue);
    onChange(originalValue !== undefined ? originalValue : newValue);
  };

  // Convert value to string for RadioGroup, ensuring it matches one of the options
  const stringValue = useMemo(() => {
    if (value === undefined || value === null) {
      return "";
    }
    const stringVal = String(value);
    // Check if the string value exists in enumValues
    const exists = enumValues.some((v) => String(v) === stringVal);
    return exists ? stringVal : "";
  }, [value, schema?.enum, schema?.enumNames]);

  const radioComponent = (
    <div
      style={{
        opacity: isDisabled ? 0.5 : 1,
        pointerEvents: isDisabled ? "none" : "auto",
      }}
    >
      <RadioGroup
        options={options}
        value={stringValue}
        onChange={handleChange}
        disabled={isDisabled}
        size={Size.Lg}
        name={id}
      />
    </div>
  );

  return (
    <FormField
      control={radioComponent}
      error={rawErrors.length > 0 ? rawErrors[0] : undefined}
      label={label}
    />
  );
}
