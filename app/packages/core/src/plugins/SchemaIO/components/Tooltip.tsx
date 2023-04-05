import React from "react";
import { Tooltip as MUITooltip, TooltipProps, Typography } from "@mui/material";
import { Help } from "@mui/icons-material";

export default function Tooltip(props: TooltipProps) {
  const { title, ...otherProps } = props;
  return (
    <MUITooltip
      title={<Typography variant="body2">{title}</Typography>}
      sx={{ fontSize: 14 }}
      {...otherProps}
    >
      <Help />
    </MUITooltip>
  );
}
