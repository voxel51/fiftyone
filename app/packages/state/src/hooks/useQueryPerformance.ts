import { useMemo } from "react";
import { useRecoilCallback } from "recoil";
import { queryPerformance } from "../recoil";

export default function () {
  const disable = useRecoilCallback(
    ({ set }) =>
      () => {
        set(queryPerformance, false);
      },
    []
  );

  const enable = useRecoilCallback(
    ({ set }) =>
      () => {
        set(queryPerformance, true);
      },
    []
  );

  return useMemo(
    () => ({
      disable,
      enable,
    }),
    [disable, enable]
  );
}
