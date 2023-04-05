import React from "react";
import { FormControlLabel, Checkbox } from "@mui/material";
import Header from "./Header";

export default function CheckboxView(props) {
  const { onChange, path, schema } = props;
  const { view = {} } = schema;

  return (
    <FormControlLabel
      control={
        <Checkbox
          disableRipple
          onChange={(e, value) => onChange(path, value)}
        />
      }
      label={<Header {...view} variant="secondary" />}
    />
  );
}
