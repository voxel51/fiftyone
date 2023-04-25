import React from "react";
import {
  Tooltip as MUITooltip,
  TooltipProps as MUITooltipProps,
  Typography,
} from "@mui/material";
import { Help } from "@mui/icons-material";

export default function Tooltip(props: TooltipProps) {
  const { title, ...otherProps } = props;
  return (
    <MUITooltip
      title={<Typography variant="body2">{title}</Typography>}
      {...otherProps}
      sx={{
        fontSize: 14,
        color: (theme) => theme.palette.text.secondary,
        ...(otherProps?.sx || {}),
      }}
    >
      <Help />
    </MUITooltip>
  );
}

type TooltipProps = Omit<MUITooltipProps, "children"> & {
  children?: MUITooltipProps["children"];
};
