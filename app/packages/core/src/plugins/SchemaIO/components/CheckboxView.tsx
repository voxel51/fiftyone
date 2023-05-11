import { Checkbox, FormControlLabel } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import autoFocus from "../utils/auto-focus";

export default function CheckboxView(props) {
  const { onChange, path, schema, data } = props;

  return (
    <FormControlLabel
      control={
        <Checkbox
          autoFocus={autoFocus(props)}
          defaultChecked={data === true || schema.default === true}
          onChange={(e, value) => onChange(path, value)}
        />
      }
      label={<HeaderView {...props} />}
    />
  );
}
