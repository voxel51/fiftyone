/**
 * Simple text input widget without built-in label
 * (FieldTemplate handles labels)
 */

import React from "react";
import { WidgetProps } from "@rjsf/utils";
import { TextField } from "@mui/material";

export default function TextWidget(props: WidgetProps) {
  const {
    id,
    value,
    disabled,
    readonly,
    autofocus,
    onChange = () => {},
    onBlur = () => {},
    onFocus = () => {},
    placeholder,
    schema,
    rawErrors = [],
  } = props;

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    onBlur(id, event.target.value);
  };

  const handleFocus = (event: React.FocusEvent<HTMLInputElement>) => {
    onFocus(id, event.target.value);
  };

  const inputType =
    schema.type === "number" || schema.type === "integer" ? "number" : "text";

  return (
    <TextField
      id={id}
      type={inputType}
      value={value ?? ""}
      placeholder={placeholder}
      disabled={disabled || readonly}
      autoFocus={autofocus}
      error={rawErrors.length > 0}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      fullWidth
      size="small"
      inputProps={{
        "data-1p-ignore": true,
      }}
    />
  );
}
