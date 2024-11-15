import React, { Fragment } from "react";
import { Snackbar, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material/styles";

type ErrorType = string | Error;

export const Error = ({
  errors,
  onClear,
}: {
  errors?: ErrorType[];
  onClear?: () => void;
}) => {
  const theme = useTheme();

  return errors?.length > 0 ? (
    <Snackbar
      open={errors.length > 0}
      onClose={onClear}
      sx={{
        backgroundColor: theme.palette.background.level1,
      }}
      message={
        <Stack direction="column" spacing={2}>
          {errors.map((err, idx) => (
            <Typography key={idx} color="error">
              {err}
            </Typography>
          ))}
        </Stack>
      }
      anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
    />
  ) : (
    <Fragment />
  );
};

export default Error;
