import React from "react";
import { FormControlLabel, Switch } from "@mui/material";
import Header from "./Header";

export default function SwitchView(props) {
  const { view = {} } = props.schema;
  return (
    <FormControlLabel
      control={<Switch />}
      label={<Header {...view} variant="secondary" />}
    />
  );
}
