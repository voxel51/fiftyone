import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { currentContextSelector } from "../recoil";
import { ExecutionContext } from "../operators";
import useCurrentSample from "./useCurrentSample";
import { useAnalyticsInfo } from "@fiftyone/analytics";

/**
 * useExecutionContext
 *
 * @param operatorName - The name of the operator to create a context for.
 * @param hooks - Additional hooks to add to the context.
 * @returns {ExecutionContext} - The generated execution context.
 */
const useExecutionContext = (
  operatorName: string,
  hooks?: object
): ExecutionContext => {
  const curCtx = useRecoilValue(currentContextSelector(operatorName));
  const currentSample = useCurrentSample();
  const {
    datasetName,
    view,
    extended,
    filters,
    selectedSamples,
    params,
    selectedLabels,
    viewName,
    extendedSelection,
    groupSlice,
    queryPerformance,
  } = curCtx;

  const [analyticsInfo] = useAnalyticsInfo();
  const ctx = useMemo(() => {
    return new ExecutionContext(
      params,
      {
        datasetName,
        view,
        extended,
        filters,
        selectedSamples,
        selectedLabels,
        currentSample,
        viewName,
        extendedSelection,
        analyticsInfo,
        groupSlice,
        queryPerformance,
      },
      hooks
    );
  }, [
    params,
    datasetName,
    view,
    extended,
    filters,
    selectedSamples,
    selectedLabels,
    hooks,
    viewName,
    currentSample,
    groupSlice,
    queryPerformance,
  ]);

  return ctx;
};

export default useExecutionContext;
