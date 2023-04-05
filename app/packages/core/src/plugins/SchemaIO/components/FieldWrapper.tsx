import React from "react";
import { Box, Typography } from "@mui/material";
import Header from "./Header";

export default function FieldWrapper(props) {
  const { schema, children } = props;
  const { view = {} } = schema;
  return (
    <Box>
      <Header {...view} sx={{ pb: 1 }} variant="secondary" omitCaption />
      {children}
      {view.caption && (
        <Typography variant="body2" color="text.tertiary" sx={{ pt: 0.5 }}>
          {view.caption}
        </Typography>
      )}
    </Box>
  );
}
