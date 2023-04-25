import React from "react";
import { Box, Typography } from "@mui/material";
import Header from "./Header";

export default function FieldWrapper(props) {
  const { schema, children, errors, path } = props;
  const { view = {} } = schema;

  const fieldErrors = errors?.[path] || [];
  const [firstError] = fieldErrors; // todo:...

  return (
    <Box>
      <Header {...view} sx={{ pb: 1 }} omitCaption />
      {children}
      {view.caption && (
        <Typography variant="body2" color="text.tertiary" sx={{ pt: 0.5 }}>
          {view.caption}
        </Typography>
      )}
      {firstError && (
        <Typography variant="body2" color="error.main" sx={{ pt: 0.5 }}>
          {firstError.reason}
        </Typography>
      )}
    </Box>
  );
}
