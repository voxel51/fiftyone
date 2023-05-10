import { Checkbox, FormControlLabel } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";

export default function CheckboxView(props) {
  const { onChange, path, schema, data } = props;

  return (
    <FormControlLabel
      control={
        <Checkbox
          defaultChecked={data === true || schema.default === true}
          onChange={(e, value) => onChange(path, value)}
        />
      }
      label={<HeaderView {...props} />}
    />
  );
}
