import { useMemo } from "react";
import { useReverbCallback } from "@fiftyone/reverb";
import { queryPerformance } from "../atoms";

export default function () {
  const disable = useReverbCallback(
    ({ set }) =>
      () => {
        set(queryPerformance, false);
      },
    [],
  );

  const enable = useReverbCallback(
    ({ set }) =>
      () => {
        set(queryPerformance, true);
      },
    [],
  );

  return useMemo(
    () => ({
      disable,
      enable,
    }),
    [disable, enable],
  );
}
