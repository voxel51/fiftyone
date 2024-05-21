import React from "react";
import { ButtonProps, CircularProgress, Button, Stack } from "@mui/material";

export default function MuiButton(props: ButtonPropsType) {
  const { loading, variant, ...otherProps } = props;

  const containedStyles =
    variant === "contained" ? { sx: { color: "white" } } : {};

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ position: "relative" }}
    >
      <Button {...containedStyles} variant={variant} {...otherProps} />
      {loading && (
        <CircularProgress size={20} sx={{ position: "absolute", left: 6 }} />
      )}
    </Stack>
  );
}

type ButtonPropsType = ButtonProps & {
  loading?: boolean;
};
