import React from "react";
import { TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";

export default function TextFieldView(props) {
  const { schema, onChange, path } = props;
  const { type, view = {} } = schema;

  return (
    <FieldWrapper {...props}>
      <TextField
        defaultValue={schema.default}
        size="small"
        fullWidth
        placeholder={view.placeholder}
        type={type}
        onChange={(e) => onChange(path, e.target.value)}
      />
    </FieldWrapper>
  );
}
