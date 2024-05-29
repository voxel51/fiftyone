import {
  Box,
  TextField as MuiTextField,
  Stack,
  TextFieldProps,
  Typography,
} from "@mui/material";
import React from "react";

export default function TextField(props: TextFieldProps) {
  const { label, ...otherProps } = props;
  return (
    <Stack spacing={1}>
      <Box>
        {label && <Typography color="text.secondary">{label}</Typography>}
      </Box>
      <MuiTextField
        InputProps={{
          sx: { backgroundColor: (theme) => theme.palette.background.default },
        }}
        sx={{ "& fieldset": { border: "none" } }}
        {...otherProps}
      />
    </Stack>
  );
}
