import { Alert, AlertTitle, Typography } from "@mui/material";
import React from "react";

export default function AlertView(props) {
  const { schema } = props;
  const { view = {} } = schema;
  const { label, description, caption, name, severity } = view;

  return (
    <Alert severity={severity || viewToSeverity[name] || "info"}>
      <AlertTitle>{label}</AlertTitle>
      {description && <Typography>{description}</Typography>}
      {caption && <Typography variant="body2">{caption}</Typography>}
    </Alert>
  );
}

const viewToSeverity = {
  Notice: "info",
  Warning: "warning",
  Error: "error",
  Success: "success",
};
