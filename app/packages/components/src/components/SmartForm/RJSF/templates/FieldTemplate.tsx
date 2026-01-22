/**
 * Minimal FieldTemplate
 */

import React from "react";
import { FieldTemplateProps } from "@rjsf/utils";
import { Box, Typography } from "@mui/material";

export default function FieldTemplate(props: FieldTemplateProps) {
  const { classNames, style, help, children, hidden } = props;

  if (hidden) {
    return (
      <div className={classNames} style={{ display: "none" }}>
        {children}
      </div>
    );
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
