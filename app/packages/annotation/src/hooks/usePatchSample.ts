import {
  generatedDatasetName as generatedDatasetNameAtom,
  isGeneratedView,
  useCurrentDatasetId,
  useModalSample,
  useRefreshSample,
} from "@fiftyone/state";
import { useCallback } from "react";
import { useRecoilValue } from "recoil";
import { JSONDeltas } from "@fiftyone/core/src/client";
import { useGetVersionToken } from "./useGetVersionToken";
import { doPatchSample, DoPatchSampleArgs } from "../util";
import type { OpType } from "../types";

type PatchOptions = {
  labelId?: string;
  labelPath?: string;
  opType?: OpType;
};

/**
 * Hook which returns a callback to apply a patch of JSON deltas to a sample.
 *
 * @param sample Sample to apply patch against
 * @param datasetId Dataset ID for the sample
 * @param getVersionToken Function which returns a version token for the sample
 * @param refreshSample Function which refreshes sample data in the app
 * @param isGenerated Whether this is from a generated view
 * @param generatedDatasetName Name of the generated dataset
 */
export const usePatchSampleWith = ({
  sample,
  datasetId,
  getVersionToken,
  refreshSample,
  isGenerated,
  generatedDatasetName,
}: Omit<
  DoPatchSampleArgs,
  "sampleDeltas" | "labelId" | "labelPath" | "opType"
>) => {
  return useCallback(
    (
      sampleDeltas: JSONDeltas,
      patchOptions?: PatchOptions
    ): Promise<boolean> => {
      return doPatchSample({
        sample,
        datasetId,
        getVersionToken,
        refreshSample,
        sampleDeltas,
        isGenerated,
        generatedDatasetName,
        labelId: patchOptions?.labelId,
        labelPath: patchOptions?.labelPath,
        opType: patchOptions?.opType,
      });
    },
    [
      datasetId,
      generatedDatasetName,
      getVersionToken,
      isGenerated,
      refreshSample,
      sample,
    ]
  );
};

/**
 * Hook which returns a callback to apply a patch of JSON deltas to the current
 * modal sample.
 */
export const usePatchSample = (): ((
  sampleDeltas: JSONDeltas,
  patchOptions?: PatchOptions
) => Promise<boolean>) => {
  const isGenerated = useRecoilValue(isGeneratedView);
  const generatedDatasetName = useRecoilValue(generatedDatasetNameAtom);

  return usePatchSampleWith({
    sample: useModalSample()?.sample,
    datasetId: useCurrentDatasetId(),
    getVersionToken: useGetVersionToken(),
    refreshSample: useRefreshSample(),
    isGenerated,
    generatedDatasetName,
  });
};
