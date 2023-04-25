import React from "react";
import { FormControlLabel, Checkbox } from "@mui/material";
import Header from "./Header";

export default function CheckboxView(props) {
  const { onChange, path, schema, data } = props;
  const { view = {} } = schema;

  return (
    <FormControlLabel
      control={
        <Checkbox
          defaultChecked={data === true || schema.default === true}
          onChange={(e, value) => onChange(path, value)}
        />
      }
      label={<Header {...view} />}
    />
  );
}
