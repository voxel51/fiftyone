import { useMemo } from "react";
import { useRecoilCallback } from "recoil";
import {
  datasetSampleCount,
  lightningThreshold,
  lightningThresholdConfig,
} from "../recoil";

export default function () {
  const disable = useRecoilCallback(
    ({ set }) =>
      () => {
        set(lightningThreshold, null);
      },
    []
  );

  const enable = useRecoilCallback(
    ({ set, snapshot }) =>
      async (threshold?: number) => {
        let setting = threshold;

        if (setting === undefined) {
          setting =
            (await snapshot.getPromise(lightningThresholdConfig)) ??
            (await snapshot.getPromise(datasetSampleCount));
        }

        set(lightningThreshold, setting);
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
