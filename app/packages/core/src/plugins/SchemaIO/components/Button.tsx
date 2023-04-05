import React from "react";
import { ButtonProps, Button as MUIButton } from "@mui/material";

export default function Button(props: ButtonProps) {
  return (
    <MUIButton
      {...props}
      disableRipple
      sx={{ textTransform: "none", ...(props?.sx || {}) }}
    />
  );
}
