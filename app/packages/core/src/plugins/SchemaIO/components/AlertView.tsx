import { Alert, AlertTitle, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";

export default function AlertView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label, description, caption, name, severity } = view;

  return (
    <Alert
      severity={severity || viewToSeverity[name] || "info"}
      {...getComponentProps(props, "container")}
    >
      <AlertTitle {...getComponentProps(props, "label")}>{label}</AlertTitle>
      {description && (
        <Typography {...getComponentProps(props, "description")}>
          {description}
        </Typography>
      )}
      {caption && (
        <Typography variant="body2" {...getComponentProps(props, "caption")}>
          {caption}
        </Typography>
      )}
    </Alert>
  );
}

const viewToSeverity = {
  Notice: "info",
  Warning: "warning",
  Error: "error",
  Success: "success",
};
