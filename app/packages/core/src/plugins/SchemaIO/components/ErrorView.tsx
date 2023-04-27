import { Typography } from "@mui/material";
import React from "react";

export default function ErrorView(props) {
  const { schema, data } = props;
  // const { view = {} } = schema;
  // const { variant = "textOnly" } = view; // todo: support in tooltip
  const errors = [
    ...(Array.isArray(data) ? data : []),
    ...(Array.isArray(schema?.default) ? schema?.default : []),
  ];

  if (errors.length === 0) return null;

  return (
    <Typography variant="body2" color="error.main">
      {errors.map(({ reason }) => reason).join(", ")}
    </Typography>
  );
}
