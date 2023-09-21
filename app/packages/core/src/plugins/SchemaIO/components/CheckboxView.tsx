import { Checkbox, FormControlLabel } from "@mui/material";
import React from "react";
import HeaderView from "./HeaderView";
import autoFocus from "../utils/auto-focus";
import { getComponentProps } from "../utils";
import { useKey } from "../hooks";

export default function CheckboxView(props) {
  const { onChange, path, schema, data } = props;
  const [key, setUserChanged] = useKey(path, schema);

  return (
    <FormControlLabel
      control={
        <Checkbox
          key={key}
          disabled={schema.view?.readOnly}
          autoFocus={autoFocus(props)}
          defaultChecked={data === true || schema.default === true}
          onChange={(e, value) => {
            onChange(path, value);
            setUserChanged();
          }}
          {...getComponentProps(props, "checkbox")}
        />
      }
      label={<HeaderView {...props} nested />}
      {...getComponentProps(props, "container")}
    />
  );
}
