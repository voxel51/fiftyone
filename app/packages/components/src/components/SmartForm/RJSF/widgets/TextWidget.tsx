/**
 * Text input widget that manages its own label
 */

import { WidgetProps } from "@rjsf/utils";
import { FormField, Input, InputProps, InputType } from "@voxel51/voodo";
import React from "react";

export default function TextWidget(props: WidgetProps) {
  const {
    label,
    value,
    disabled,
    readonly,
    autofocus,
    onChange = () => {},
    placeholder,
    schema,
    rawErrors = [],
  } = props;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  const inputType =
    schema.type === "number" || schema.type === "integer" ? "number" : "text";

  const inputProps: InputProps = {};
  if (inputType === "number" && schema.multipleOf !== undefined) {
    inputProps.step = schema.multipleOf;
  }

  const inputComponent = (
    <Input
      disabled={disabled || readonly}
      autoFocus={autofocus}
      type={inputType as InputType}
      value={value ?? ""}
      placeholder={placeholder}
      onChange={handleChange}
      {...inputProps}
    />
  );

  return <FormField control={inputComponent} label={label} />;
}
