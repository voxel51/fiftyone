import { snackbarErrors } from "@fiftyone/state";
import { useCallback } from "react";
import { useSetReverbState } from "@fiftyone/reverb";

export default function useTimeout() {
  const setErrors = useSetReverbState(snackbarErrors);
  return useCallback(
    (queryTime: number) => {
      setErrors([
        `Grid request timed out at ${queryTime} second${
          queryTime > 1 ? "s" : ""
        }`,
      ]);
    },
    [setErrors],
  );
}
