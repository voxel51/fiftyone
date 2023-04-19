import React from "react";
import { TextField } from "@mui/material";
import FieldWrapper from "./FieldWrapper";
import { log } from "../utils";

export default function TextFieldView(props) {
  const { schema, onChange, path, data } = props;
  const { type, view = {} } = schema;

  return (
    <FieldWrapper {...props}>
      <TextField
        defaultValue={data ?? schema.default}
        size="small"
        fullWidth
        placeholder={view.placeholder}
        type={type}
        onChange={(e) => onChange(path, e.target.value)}
      />
    </FieldWrapper>
  );
}
