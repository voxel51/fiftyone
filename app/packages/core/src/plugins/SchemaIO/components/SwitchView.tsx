import { FormControlLabel, Switch } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { autoFocus } from "../utils";

export default function SwitchView(props) {
  const { schema, data } = props;

  return (
    <FormControlLabel
      control={
        <Switch
          autoFocus={autoFocus(props)}
          defaultChecked={data === true || schema.default === true}
        />
      }
      label={<HeaderView {...props} />}
    />
  );
}
