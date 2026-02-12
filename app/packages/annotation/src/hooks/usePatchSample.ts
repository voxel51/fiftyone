import {
  useCurrentDatasetId,
  useModalSample,
  useRefreshSample,
} from "@fiftyone/state";
import { useCallback } from "react";
import { JSONDeltas } from "@fiftyone/core/src/client";
import { useGetVersionToken } from "./useGetVersionToken";
import { doPatchSample, DoPatchSampleArgs } from "../util";

/**
 * Hook which returns a callback to apply a patch of JSON deltas to a sample.
 *
 * @param sample Sample to apply patch against
 * @param datasetId Dataset ID for the sample
 * @param getVersionToken Function which returns a version token for the sample
 * @param refreshSample Function which refreshes sample data in the app
 */
export const usePatchSampleWith = ({
  sample,
  datasetId,
  getVersionToken,
  refreshSample,
}: Omit<DoPatchSampleArgs, "sampleDeltas">) => {
  return useCallback(
    (sampleDeltas: JSONDeltas): Promise<boolean> => {
      return doPatchSample({
        sample,
        datasetId,
        getVersionToken,
        refreshSample,
        sampleDeltas,
      });
    },
    [datasetId, getVersionToken, refreshSample, sample]
  );
};

/**
 * Hook which returns a callback to apply a patch of JSON deltas to the current
 * modal sample.
 */
export const usePatchSample = (): ((
  sampleDeltas: JSONDeltas
) => Promise<boolean>) => {
  return usePatchSampleWith({
    sample: useModalSample()?.sample,
    datasetId: useCurrentDatasetId(),
    getVersionToken: useGetVersionToken(),
    refreshSample: useRefreshSample(),
  });
};
