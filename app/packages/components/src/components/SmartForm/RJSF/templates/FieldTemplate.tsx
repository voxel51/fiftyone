/**
 * Minimal FieldTemplate
 */

import { Box, Typography } from "@mui/material";
import { FieldTemplateProps } from "@rjsf/utils";
import { Text, TextColor } from "@voxel51/voodo";
import React from "react";

export default function FieldTemplate(props: FieldTemplateProps) {
  const { classNames, style, rawErrors, help, children, hidden } = props;

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
      {Array.isArray(rawErrors) && rawErrors.length > 0 && (
        <Text color={TextColor.Destructive}>{rawErrors.join(". ")}</Text>
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
