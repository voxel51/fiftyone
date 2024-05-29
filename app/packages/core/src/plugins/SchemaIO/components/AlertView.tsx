import { Alert, AlertTitle, Typography } from "@mui/material";
import React from "react";
import { getComponentProps } from "../utils";
import Markdown from "./Markdown";

export default function AlertView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label, description, caption, name, severity } = view;

  return (
    <Alert
      severity={severity || viewToSeverity[name] || "info"}
      {...getComponentProps(props, "container")}
    >
      <AlertTitle {...getComponentProps(props, "label")}>
        <Markdown {...getComponentProps(props, "label.markdown")}>
          {label}
        </Markdown>
      </AlertTitle>
      {description && (
        <Typography {...getComponentProps(props, "description")}>
          <Markdown {...getComponentProps(props, "description.markdown")}>
            {description}
          </Markdown>
        </Typography>
      )}
      {caption && (
        <Typography variant="body2" {...getComponentProps(props, "caption")}>
          <Markdown {...getComponentProps(props, "caption.markdown")}>
            {caption}
          </Markdown>
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
