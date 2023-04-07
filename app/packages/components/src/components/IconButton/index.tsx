import React from "react";
import { IconButton as MUIIconButton, IconButtonProps } from "@mui/material";

export default function IconButton(props: IconButtonProps) {
  return (
    <MUIIconButton
      {...props}
      sx={{
        color: (theme) => theme.palette.text.secondary,
        p: 0.5,
        ml: 0.5,
        ...props.sx,
      }}
    />
  );
}
