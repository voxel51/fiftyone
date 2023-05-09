import { Box, Typography } from "@mui/material";
import React from "react";
import ErrorView from "./ErrorView";
import HeaderView from "./HeaderView";

export default function FieldWrapper(props) {
  const { schema, children, errors, path } = props;
  const { view = {} } = schema;

  const fieldErrors = errors?.[path] || [];

  return (
    <Box>
      <HeaderView {...props} sx={{ pb: 1 }} omitCaption omitErrors />
      {children}
      {view.caption && (
        <Typography variant="body2" color="text.tertiary" sx={{ pt: 0.5 }}>
          {view.caption}
        </Typography>
      )}
      <ErrorView schema={{}} data={fieldErrors} />
    </Box>
  );
}
