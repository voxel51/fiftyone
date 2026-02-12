/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import useUpdateSamples from "./useUpdateSamples";
import { useSetRecoilState } from "recoil";
import { refresher } from "../recoil";
import { useCallback } from "react";
import { Sample } from "@fiftyone/looker";

/**
 * Refresh a sample in both the modal and the grid.
 */
export const useRefreshSample = () => {
  const updateSamples = useUpdateSamples();
  const setRefresher = useSetRecoilState(refresher);

  return useCallback(
    (sample: Sample) => {
      updateSamples([[sample._id, sample]]);
      setRefresher((curr) => curr + 1);
    },
    [setRefresher, updateSamples]
  );
};
