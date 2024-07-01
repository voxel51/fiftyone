import React from "react";
import { ButtonProps, Button as MUIButton } from "@mui/material";

export default function Button(props: ButtonProps) {
  const { variant } = props;
  return (
    <MUIButton
      color={variant === "outlined" ? "secondary" : undefined}
      {...props}
      sx={{ textTransform: "none", ...(props?.sx || {}) }}
    />
  );
}
