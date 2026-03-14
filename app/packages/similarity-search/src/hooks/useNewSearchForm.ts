import { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { useOperatorExecutor } from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { BrainKeyConfig, CloneConfig, QueryType } from "../types";
import { INIT_RUN_OPERATOR_URI } from "../constants";
import { canSubmitSearch, buildExecutionParams } from "../utils";

export const useNewSearchForm = (
  brainKeys: BrainKeyConfig[],
  cloneConfig: CloneConfig | null | undefined,
  onSubmitted: () => void
) => {
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const view = useRecoilValue(fos.view);

  const hasSamplesSelected = useMemo(
    () =>
      (selectedLabels && selectedLabels.length > 0) ||
      (selectedSamples && selectedSamples.size > 0),
    [selectedSamples, selectedLabels]
  );

  const firstTextKey = useMemo(
    () => brainKeys.find((bk) => bk.supports_prompts),
    [brainKeys]
  );

  const defaultBrainKey = useMemo(() => {
    if (cloneConfig?.brain_key) return cloneConfig.brain_key;
    if (hasSamplesSelected) return brainKeys[0]?.key ?? "";
    if (firstTextKey) return firstTextKey.key;
    return brainKeys[0]?.key ?? "";
  }, [cloneConfig, hasSamplesSelected, firstTextKey, brainKeys]);

  const defaultQueryType = useMemo((): QueryType => {
    if (cloneConfig?.query_type) return cloneConfig.query_type;
    if (hasSamplesSelected) return "image";
    if (firstTextKey) return "text";
    return "image";
  }, [cloneConfig, hasSamplesSelected, firstTextKey]);

  const [brainKey, setBrainKey] = useState(defaultBrainKey);
  const [queryType, setQueryType] = useState<QueryType>(defaultQueryType);
  const [textQuery, setTextQuery] = useState(cloneConfig?.query ?? "");
  const [k, setK] = useState<number | "">(cloneConfig?.k ?? 25);
  const [reverse, setReverse] = useState(cloneConfig?.reverse ?? false);
  const [distField, setDistField] = useState(cloneConfig?.dist_field ?? "");
  const [runName, setRunName] = useState("");
  const hasView = Array.isArray(view) && view.length > 0;
  const [searchScope, setSearchScope] = useState<"view" | "dataset">("view");

  const { execute: initRun } = useOperatorExecutor(INIT_RUN_OPERATOR_URI);

  const selectedConfig = brainKeys.find((bk) => bk.key === brainKey);
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? true;

  useEffect(() => {
    if (!brainKey && brainKeys.length > 0) {
      setBrainKey(brainKeys[0].key);
    }
  }, [brainKey, brainKeys]);

  useEffect(() => {
    if (!supportsPrompts && queryType === "text") {
      setQueryType("image");
    }
  }, [supportsPrompts, queryType]);

  const queryIds = useMemo(() => {
    if (selectedLabels && selectedLabels.length > 0) {
      return selectedLabels.map((l: any) => l.label_id);
    }
    if (selectedSamples && selectedSamples.size > 0) {
      return Array.from(selectedSamples);
    }
    return [];
  }, [selectedSamples, selectedLabels]);

  const negativeQueryIds: string[] = [];

  const executionParams = useMemo(
    () =>
      buildExecutionParams({
        brainKey,
        queryType,
        textQuery,
        queryIds,
        reverse,
        patchesField: selectedConfig?.patches_field,
        searchScope,
        hasView,
        view: view as unknown[],
        k,
        distField,
        runName,
        negativeQueryIds,
      }),
    [
      brainKey,
      queryType,
      textQuery,
      k,
      reverse,
      distField,
      runName,
      selectedConfig,
      view,
      searchScope,
      hasView,
      queryIds,
      negativeQueryIds,
    ]
  );

  const handleSuccess = useCallback(
    (result: any) => {
      if (result?.delegated) {
        const operatorRunId = result?.result?.id?.$oid;
        initRun(
          { ...executionParams, operator_run_id: operatorRunId },
          { callback: () => onSubmitted() }
        );
      } else {
        onSubmitted();
      }
    },
    [initRun, executionParams, onSubmitted]
  );

  const handleError = useCallback((error: any) => {
    console.error("Similarity search failed:", error);
  }, []);

  const kError = typeof k === "number" && k > 10000;

  const canSubmit = canSubmitSearch(
    brainKey,
    queryType,
    textQuery,
    queryIds.length
  );

  const brainKeyOptions = brainKeys.map((bk) => ({
    id: bk.key,
    data: {
      label:
        bk.key + (bk.patches_field ? ` (patches: ${bk.patches_field})` : ""),
    },
  }));

  return {
    // form state
    brainKey,
    setBrainKey,
    queryType,
    setQueryType,
    textQuery,
    setTextQuery,
    k,
    setK,
    reverse,
    setReverse,
    distField,
    setDistField,
    runName,
    setRunName,
    searchScope,
    setSearchScope,

    // derived
    selectedConfig,
    supportsPrompts,
    supportsLeast,
    queryIds,
    selectedLabels,
    kError,
    canSubmit,
    brainKeyOptions,
    executionParams,

    // handlers
    handleSuccess,
    handleError,
  };
};
