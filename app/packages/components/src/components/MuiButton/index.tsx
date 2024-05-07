import React from "react";
import { ButtonProps, CircularProgress, Button, Stack } from "@mui/material";

export default function MuiButton(props: ButtonPropsType) {
  const { loading, ...otherProps } = props;
  return (
    <Stack
      direction="row"
      spacing={2}
      alignItems="center"
      sx={{ position: "relative" }}
    >
      <Button {...otherProps} />
      {loading && (
        <CircularProgress size={20} sx={{ position: "absolute", left: 6 }} />
      )}
    </Stack>
  );
}

type ButtonPropsType = ButtonProps & {
  loading?: boolean;
};
