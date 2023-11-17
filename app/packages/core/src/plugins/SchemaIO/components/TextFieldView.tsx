import { TextField } from "@mui/material";
import React from "react";
import { useKey } from "../hooks";
import { getComponentProps } from "../utils";
import autoFocus from "../utils/auto-focus";
import FieldWrapper from "./FieldWrapper";

export default function TextFieldView(props) {
  const { schema, onChange, path, data } = props;
  const { type, view = {}, min, max, multipleOf = 1 } = schema;

  const { inputProps = {}, ...fieldProps } = getComponentProps(props, "field");

  const [key, setUserChanged] = useKey(path, schema, data, true);

  return (
    <FieldWrapper {...props}>
      <TextField
        key={key}
        disabled={view.readOnly}
        autoFocus={autoFocus(props)}
        defaultValue={data}
        size="small"
        fullWidth
        placeholder={view.placeholder}
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
