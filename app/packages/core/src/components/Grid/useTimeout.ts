import { snackbarErrors } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetRecoilState } from "recoil";

export default function useTimeout() {
  const setErrors = useSetRecoilState(snackbarErrors);
  return useCallback(
    (queryTime: number) => {
      setErrors([`Grid request timed out at ${queryTime}`]);
    },
    [setErrors]
  );
}
