import { Box, Tooltip, TooltipProps } from "@mui/material";
import React from "react";

export default function TooltipProvider(props: TooltipProps) {
  const { title, children, ...tooltipProps } = props;
  if (!title) return children;
  return (
    <Tooltip title={title} {...tooltipProps}>
      <Box component="span">{children}</Box>
    </Tooltip>
  );
}
