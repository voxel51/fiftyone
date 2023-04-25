import React from "react";
import { FormControlLabel, Switch } from "@mui/material";
import Header from "./Header";

export default function SwitchView(props) {
  const { schema, data } = props;
  const { view = {} } = schema;
  return (
    <FormControlLabel
      control={
        <Switch defaultChecked={data === true || schema.default === true} />
      }
      label={<Header {...view} />}
    />
  );
}
