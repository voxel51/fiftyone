/**
 * Text input widget that manages its own label
 */

import React from "react";
import { WidgetProps } from "@rjsf/utils";
import { Box, TextField, Typography } from "@mui/material";

export default function TextWidget(props: WidgetProps) {
  const {
    id,
    label,
    value,
    disabled,
    readonly,
    autofocus,
    required,
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
    <Box sx={{ width: "100%" }}>
      {label && (
        <Typography
          component="label"
          htmlFor={id}
          variant="body1"
          color="text.primary"
          sx={{
            display: "block",
            marginBottom: 1,
            fontWeight: 400,
          }}
        >
          {label}
          {required && (
            <span style={{ color: "error.main", marginLeft: "4px" }}>*</span>
          )}
        </Typography>
      )}
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
    </Box>
  );
}
