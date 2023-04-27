import { FormControlLabel, Switch } from "@mui/material";
import React from "react";
import { HeaderView } from ".";

export default function SwitchView(props) {
  const { schema, data } = props;

  return (
    <FormControlLabel
      control={
        <Switch defaultChecked={data === true || schema.default === true} />
      }
      label={<HeaderView {...props} />}
    />
  );
}
