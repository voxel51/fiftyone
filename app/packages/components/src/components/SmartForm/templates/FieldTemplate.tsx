/**
 * Minimal FieldTemplate
 */

import React from "react";
import { FieldTemplateProps } from "@rjsf/utils";
import { Box, Typography } from "@mui/material";

export default function FieldTemplate(props: FieldTemplateProps) {
  const { classNames, style, errors, help, children, hidden } = props;

  if (hidden) {
    return <div style={{ display: "none" }}>{children}</div>;
  }

  return (
    <Box
      className={classNames}
      style={style}
      sx={{
        width: "100%",
      }}
    >
      {children}
      {errors && (
        <Typography
          variant="body2"
          color="error"
          sx={{
            marginTop: 0.5,
          }}
        >
          {errors}
        </Typography>
      )}
      {help && (
        <Typography
          variant="body2"
          color="text.tertiary"
          sx={{
            marginTop: 0.5,
          }}
        >
          {help}
        </Typography>
      )}
    </Box>
  );
}
