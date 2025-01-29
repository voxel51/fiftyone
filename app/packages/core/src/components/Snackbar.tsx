import { Toast } from "@fiftyone/components";
import * as fos from "@fiftyone/state";
import React from "react";
import { useRecoilState } from "recoil";

const SNACK_VISIBLE_DURATION = 5000;

export default function Snackbar() {
  const [snackErrors, setSnackErrors] = useRecoilState(fos.snackbarErrors);
  return snackErrors.length ? (
    <Toast
      duration={SNACK_VISIBLE_DURATION}
      layout={{
        bottom: "50px !important",
        vertical: "bottom",
        horizontal: "center",
      }}
      message={
        <>
          <div>{snackErrors}</div>
          <div></div>
        </>
      }
      onHandleClose={() => setSnackErrors([])}
    />
  ) : null;
}
