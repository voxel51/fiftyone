import React from "react";
import {
  ButtonProps,
  CircularProgress,
  Button,
  Stack,
  useTheme,
} from "@mui/material";

export default function MuiButton(props: ButtonPropsType) {
  const { loading, variant, ...otherProps } = props;
  const theme = useTheme();

  const containedStyles =
    variant === "contained" ? { sx: { color: "white" } } : {};
  const outlinedStyles =
    variant === "outlined"
      ? {
          sx: {
            color: theme.palette.text.secondary,
            borderColor: theme.palette.text.secondary,
          },
        }
      : {};

  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ position: "relative" }}
    >
      <Button
        {...containedStyles}
        {...outlinedStyles}
        variant={variant}
        {...otherProps}
      />
      {loading && (
        <CircularProgress size={20} sx={{ position: "absolute", left: 6 }} />
      )}
    </Stack>
  );
}

type ButtonPropsType = ButtonProps & {
  loading?: boolean;
};
