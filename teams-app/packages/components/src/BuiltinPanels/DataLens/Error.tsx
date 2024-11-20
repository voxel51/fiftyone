import React, { Fragment } from "react";
import { Alert, Snackbar, Stack, Typography } from "@mui/material";

type ErrorType = string | Error;

export const Error = ({
  errors,
  onClear,
}: {
  errors?: ErrorType[];
  onClear?: () => void;
}) => {
  return errors?.length > 0 ? (
    <Snackbar
      open={errors.length > 0}
      onClose={onClear}
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    >
      <Alert
        onClose={onClear}
        severity="error"
        variant="filled"
        sx={{ width: "100%" }}
      >
        <Stack direction="column" spacing={1}>
          {errors.map((err, idx) => (
            <Typography key={idx}>{err}</Typography>
          ))}
        </Stack>
      </Alert>
    </Snackbar>
  ) : (
    <Fragment />
  );
};

export default Error;
