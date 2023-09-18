import { FormControlLabel, Switch } from "@mui/material";
import React from "react";
import { HeaderView } from ".";
import { autoFocus, getComponentProps } from "../utils";

export default function SwitchView(props) {
  const { schema, data, onChange, path } = props;

  return (
    <FormControlLabel
      control={
        <Switch
          disabled={schema.view?.readOnly}
          autoFocus={autoFocus(props)}
          defaultChecked={data === true || schema.default === true}
          onChange={(e, checked) => onChange(path, checked)}
          {...getComponentProps(props, "switch")}
        />
      }
      label={<HeaderView {...props} nested />}
      {...getComponentProps(props, "container")}
    />
  );
}
