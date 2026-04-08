import { useCallback, useMemo, useState } from "react";
import { useOperatorExecutor } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { useBrowserStorage } from "@fiftyone/state";
import { BrainKeyConfig, QueryType, SearchScope } from "../types";
import { INIT_RUN_OPERATOR_URI } from "../constants";
import { canSubmitSearch, buildExecutionParams, UploadedImage } from "../utils";

type UseSearchSubmissionInput = {
  brainKey: string;
  queryType: QueryType;
  textQuery: string;
  queryIds: string[];
  negativeQueryIds: string[];
  uploadedImage: UploadedImage | null;
  reverse: boolean;
  selectedConfig?: BrainKeyConfig;
  searchScope: SearchScope;
  hasView: boolean;
  view: unknown[];
  k: number | "";
  distField: string;
  runName: string;
  dynamicResults: boolean;
  onSubmitted: () => void;
};

/**
 * Hook that builds execution params and handles search submission.
 */
export const useSearchSubmission = (input: UseSearchSubmissionInput) => {
  const { execute: initRun } = useOperatorExecutor(INIT_RUN_OPERATOR_URI);
  const [submitting, setSubmitting] = useState(false);
  const datasetId = fos.useAssertedRecoilValue(fos.datasetId);
  const [lastUsedBrainKeys, setLastUsedBrainKeys] =
    useBrowserStorage("lastUsedBrainKeys");

  const handleOptionSelected = useCallback(() => {
    setSubmitting(true);

    const current = lastUsedBrainKeys ? JSON.parse(lastUsedBrainKeys) : {};
    setLastUsedBrainKeys(
      JSON.stringify({ ...current, [datasetId]: input.brainKey })
    );
  }, [lastUsedBrainKeys, setLastUsedBrainKeys, datasetId, input.brainKey]);

  const executionParams = useMemo(
    () =>
      buildExecutionParams({
        brainKey: input.brainKey,
        queryType: input.queryType,
        textQuery: input.textQuery,
        queryIds: input.queryIds,
        reverse: input.reverse,
        patchesField: input.selectedConfig?.patches_field,
        searchScope: input.searchScope,
        hasView: input.hasView,
        view: input.view,
        k: input.k,
        distField: input.distField,
        runName: input.runName,
        negativeQueryIds: input.negativeQueryIds,
        uploadedImage: input.uploadedImage,
        dynamicResults: input.dynamicResults,
      }),
    [
      input.brainKey,
      input.queryType,
      input.textQuery,
      input.k,
      input.reverse,
      input.distField,
      input.runName,
      input.dynamicResults,
      input.selectedConfig,
      input.view,
      input.searchScope,
      input.hasView,
      input.queryIds,
      input.negativeQueryIds,
      input.uploadedImage,
    ]
  );

  const handleSuccess = useCallback(
    (result: Record<string, unknown>) => {
      setSubmitting(false);
      if (result?.delegated) {
        const resultObj = result?.result as
          | { id?: { $oid?: string } }
          | undefined;
        const operatorRunId = resultObj?.id?.$oid;
        initRun(
          { ...executionParams, operator_run_id: operatorRunId },
          { callback: () => input.onSubmitted() }
        );
      } else {
        input.onSubmitted();
      }
    },
    [initRun, executionParams, input.onSubmitted]
  );

  const handleError = useCallback((error: unknown) => {
    setSubmitting(false);
    console.error("Similarity search failed:", error);
  }, []);

  const kError =
    input.k !== "" &&
    (!Number.isFinite(input.k) ||
      !Number.isInteger(input.k) ||
      input.k < 1 ||
      input.k > 10000);

  const canSubmit =
    !kError &&
    canSubmitSearch(
      input.brainKey,
      input.queryType,
      input.textQuery,
      input.queryIds.length,
      !!input.uploadedImage
    );

  return {
    executionParams,
    handleOptionSelected,
    handleSuccess,
    handleError,
    kError,
    canSubmit,
    submitting,
  };
};
