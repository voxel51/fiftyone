import { Toast, useTheme } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import { Button } from "@mui/material";
import React from "react";
import { useRecoilState } from "recoil";

const SNACK_VISIBLE_DURATION = 5000;

export default function Snackbar() {
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);
  const theme = useTheme();
  return snackErrors.length ? (
    <Toast
      duration={SNACK_VISIBLE_DURATION}
      layout={{
        bottom: "50px !important",
        vertical: "bottom",
        horizontal: "center",
      }}
      message={<div style={{ width: "100%" }}>{snackErrors}</div>}
      onHandleClose={() => setSnackErrors([])}
      primary={() => {
        return (
          <div>
            <Button
              data-cy="btn-dismiss-alert"
              variant="contained"
              size="small"
              onClick={() => {
                setSnackErrors([]);
              }}
              sx={{
                marginLeft: "auto",
                backgroundColor: theme.primary.main,
                color: theme.text.primary,
                boxShadow: 0,
              }}
            >
              Dismiss
            </Button>
          </div>
        );
      }}
    />
  ) : null;
}
