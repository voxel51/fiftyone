import { TextField } from "@mui/material";
import React from "react";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import FieldWrapper from "./FieldWrapper";
import { NumberSchemaType, ViewPropsType } from "../utils/types";

export default function TextFieldView(props: ViewPropsType<NumberSchemaType>) {
  const { schema, onChange, path, data } = props;
  const { type, view = {}, min, max, multipleOf = 1 } = schema;
  const { readOnly, placeholder, condensed, label } = view;

  const { inputProps = {}, ...fieldProps } = getComponentProps(props, "field");

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props} hideHeader={condensed}>
      <TextField
        key={key}
        disabled={readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={data}
        size="small"
        fullWidth
        placeholder={condensed ? placeholder || label : placeholder}
        type={type}
        onChange={(e) => {
          const value = e.target.value;
          onChange(path, type === "number" ? parseFloat(value) : value);
          setUserChanged();
        }}
        inputProps={{ min, max, step: multipleOf, ...inputProps }}
        {...fieldProps}
      />
    </FieldWrapper>
  );
}
