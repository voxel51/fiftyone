import { TextField } from "@mui/material";
import React from "react";
import { useKey } from "../hooks";
import { getComponentProps, getFieldSx } from "../utils";
import autoFocus from "../utils/auto-focus";
import { NumberSchemaType, ViewPropsType } from "../utils/types";
import FieldWrapper from "./FieldWrapper";

export default function TextFieldView(props: ViewPropsType<NumberSchemaType>) {
  const { schema, onChange, path, data } = props;
  const { type, view = {}, min, max, multipleOf = 1 } = schema;
  const { readOnly, placeholder, compact, label, color, variant } = view;

  const { inputProps = {}, ...fieldProps } = getComponentProps(props, "field", {
    sx: getFieldSx({ color, variant }),
  });

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props} hideHeader={compact}>
      <TextField
        key={key}
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={data}
        size="small"
        fullWidth
        placeholder={compact ? placeholder || label : placeholder}
        type={type}
        onChange={(e) => {
          const value = e.target.value;
          onChange(path, type === "number" ? parseFloat(value) : value, schema);
          setUserChanged();
        }}
        inputProps={{
          min,
          max,
          step: multipleOf,
          style: compact ? { padding: "0.45rem 1rem" } : {},
          ...inputProps,
        }}
        {...fieldProps}
      />
    </FieldWrapper>
  );
}
