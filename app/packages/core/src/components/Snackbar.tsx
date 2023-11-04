import * as fos from "@fiftyone/state";
import { Snackbar as SnackbarMui } from "@material-ui/core";
import MuiAlert, { AlertProps } from "@mui/material/Alert";
import React from "react";
import { useRecoilState } from "recoil";

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(function Alert(
  props,
  ref
) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

const SNACK_VISIBLE_DURATION = 5000;

export default function Snackbar() {
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);
  return (
    <SnackbarMui
      open={!!snackErrors.length}
      autoHideDuration={SNACK_VISIBLE_DURATION}
      onClose={() => {
        setSnackErrors([]);
      }}
    >
      <Alert
        onClose={() => {
          setSnackErrors([]);
        }}
        severity="error"
        sx={{ width: "100%" }}
      >
        {snackErrors}
      </Alert>
    </SnackbarMui>
  );
}
