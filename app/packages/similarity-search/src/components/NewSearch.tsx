import ArrowBack from "@mui/icons-material/ArrowBack";
import {
  Button,
  FormField,
  Heading,
  Input,
  InputType,
  Select,
  Size,
  Stack,
  Text,
  TextArea,
  TextColor,
  TextVariant,
  Toggle,
  Orientation,
  Spacing,
  Variant,
} from "@voxel51/voodo";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import {
  OperatorExecutionButton,
  useOperatorExecutor,
} from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { BrainKeyConfig, CloneConfig, QueryType } from "../types";
import { SEARCH_OPERATOR_URI, INIT_RUN_OPERATOR_URI } from "../constants";
import { canSubmitSearch, buildExecutionParams } from "../utils";

type NewSearchProps = {
  brainKeys: BrainKeyConfig[];
  cloneConfig?: CloneConfig | null;
  onBack: () => void;
  onSubmitted: () => void;
};

const BackIcon = () => <ArrowBack fontSize="small" />;

export default function NewSearch({
  brainKeys,
  cloneConfig,
  onBack,
  onSubmitted,
}: NewSearchProps) {
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const altSelectedSamples = useRecoilValue(fos.altSelectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const view = useRecoilValue(fos.view);

  const [brainKey, setBrainKey] = useState(cloneConfig?.brain_key ?? "");
  const [queryType, setQueryType] = useState<QueryType>(
    cloneConfig?.query_type ?? "text"
  );
  const [textQuery, setTextQuery] = useState(cloneConfig?.query ?? "");
  const [k, setK] = useState<number | "">(cloneConfig?.k ?? "");
  const [reverse, setReverse] = useState(cloneConfig?.reverse ?? false);
  const [distField, setDistField] = useState(cloneConfig?.dist_field ?? "");
  const [runName, setRunName] = useState("");
  const hasView = Array.isArray(view) && view.length > 0;
  const [searchScope, setSearchScope] = useState<"view" | "dataset">("view");

  const { execute: initRun } = useOperatorExecutor(INIT_RUN_OPERATOR_URI);

  // Get config for selected brain key
  const selectedConfig = brainKeys.find((bk) => bk.key === brainKey);
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? true;
  const maxK = selectedConfig?.max_k;

  // Auto-select first brain key if none selected
  useEffect(() => {
    if (!brainKey && brainKeys.length > 0) {
      setBrainKey(brainKeys[0].key);
    }
  }, [brainKey, brainKeys]);

  // Reset query type if brain key doesn't support prompts
  useEffect(() => {
    if (!supportsPrompts && queryType === "text") {
      setQueryType("image");
    }
  }, [supportsPrompts, queryType]);

  const getQueryIds = useCallback(() => {
    if (selectedLabels && selectedLabels.length > 0) {
      return selectedLabels.map((l: any) => l.label_id);
    }
    if (selectedSamples && selectedSamples.size > 0) {
      return Array.from(selectedSamples);
    }
    return [];
  }, [selectedSamples, selectedLabels]);

  const getNegativeQueryIds = useCallback(() => {
    if (altSelectedSamples && altSelectedSamples.size > 0) {
      return Array.from(altSelectedSamples);
    }
    return [];
  }, [altSelectedSamples]);

  // Build the params that will be passed to the operator
  const executionParams = useMemo(
    () =>
      buildExecutionParams({
        brainKey,
        queryType,
        textQuery,
        queryIds: getQueryIds(),
        reverse,
        patchesField: selectedConfig?.patches_field,
        searchScope,
        hasView,
        view: view as unknown[],
        k,
        distField,
        runName,
        negativeQueryIds: getNegativeQueryIds(),
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
      getQueryIds,
      getNegativeQueryIds,
    ]
  );

  // Called when operator execution completes (or is queued for delegation)
  const handleSuccess = useCallback(
    (result: any) => {
      if (result?.delegated) {
        // Delegated: the DO is queued. Create a run record so it
        // appears in the panel list immediately while the worker
        // picks it up.
        const operatorRunId = result?.result?.id?.$oid;
        initRun(
          {
            ...executionParams,
            operator_run_id: operatorRunId,
          },
          {
            callback: () => onSubmitted(),
          }
        );
      } else {
        // Immediate execution: the operator already created the
        // run record and completed the search.
        onSubmitted();
      }
    },
    [initRun, executionParams, onSubmitted]
  );

  const handleError = useCallback((error: any) => {
    console.error("Similarity search failed:", error);
  }, []);

  const brainKeyOptions = brainKeys.map((bk) => ({
    id: bk.key,
    data: {
      label:
        bk.key + (bk.patches_field ? ` (patches: ${bk.patches_field})` : ""),
    },
  }));

  const kError = maxK != null && typeof k === "number" && k > maxK;

  return (
    <div className="p-4">
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center", marginBottom: "1.5rem" }}
      >
        <Button
          borderless
          size={Size.Sm}
          variant={Variant.Borderless}
          leadingIcon={BackIcon}
          onClick={onBack}
        />
        <Heading level="h2">
          {cloneConfig ? "Clone Search" : "New Search"}
        </Heading>
      </Stack>

      <Stack orientation={Orientation.Column} spacing={Spacing.Lg}>
        {/* Brain key selector */}
        <FormField
          label="Brain Key"
          control={
            <Select
              exclusive
              options={brainKeyOptions}
              value={brainKey}
              onChange={(value) => setBrainKey((value as string) ?? "")}
            />
          }
        />

        {brainKeys.length === 0 && (
          <div className="rounded-md border border-content-border-secondary-primary bg-content-bg-card-2 p-3">
            <Text variant={TextVariant.Sm} color={TextColor.Secondary}>
              No similarity brain keys found. Run{" "}
              <code className="font-mono text-xs">
                dataset.compute_similarity()
              </code>{" "}
              first to create an index.
            </Text>
          </div>
        )}

        {/* Query type toggle */}
        {supportsPrompts && (
          <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
            <Button
              variant={
                queryType === "text" ? Variant.Primary : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => setQueryType("text")}
              style={{ flex: 1 }}
            >
              Text Prompt
            </Button>
            <Button
              variant={
                queryType === "image" ? Variant.Primary : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => setQueryType("image")}
              style={{ flex: 1 }}
            >
              Image Similarity
            </Button>
          </Stack>
        )}

        {/* Query input */}
        {queryType === "text" ? (
          <FormField
            label="Text query"
            control={
              <TextArea
                placeholder="Enter a text prompt..."
                value={textQuery}
                onChange={(e) => setTextQuery(e.target.value)}
                rows={3}
                size={Size.Sm}
              />
            }
          />
        ) : (
          <div
            className={`rounded-md border p-3 ${
              getQueryIds().length > 0
                ? "border-action-primary-primary bg-content-bg-card-2"
                : "border-content-border-secondary-primary bg-content-bg-card-2"
            }`}
          >
            <Text
              variant={TextVariant.Sm}
              color={
                getQueryIds().length > 0
                  ? TextColor.Success
                  : TextColor.Secondary
              }
            >
              {getQueryIds().length > 0
                ? `${getQueryIds().length} ${
                    selectedLabels?.length > 0 ? "labels" : "samples"
                  } selected (positive)${
                    getNegativeQueryIds().length > 0
                      ? ` \u00B7 ${getNegativeQueryIds().length} negative`
                      : ""
                  }`
                : "Select samples in the grid (Alt+click for negative)"}
            </Text>
          </div>
        )}

        {/* K value */}
        <FormField
          label={`Number of results (k)${maxK ? ` (max: ${maxK})` : ""}`}
          error={kError ? `Exceeds max k of ${maxK}` : undefined}
          control={
            <Input
              type={InputType.Number}
              value={k === "" ? "" : String(k)}
              onChange={(e) => {
                const val = e.target.value;
                setK(val === "" ? "" : parseInt(val, 10));
              }}
              min={1}
              max={maxK ?? undefined}
              size={Size.Sm}
              error={kError}
            />
          }
        />

        {/* Reverse toggle */}
        {supportsLeast && (
          <Toggle
            checked={reverse}
            onChange={(checked) => setReverse(checked)}
            label="Least similar (reverse)"
            size={Size.Sm}
          />
        )}

        {/* Search scope */}
        {hasView && (
          <FormField
            label="Search scope"
            control={
              <Stack orientation={Orientation.Row} spacing={Spacing.Xs}>
                <Button
                  variant={
                    searchScope === "view" ? Variant.Primary : Variant.Secondary
                  }
                  size={Size.Sm}
                  onClick={() => setSearchScope("view")}
                  style={{ flex: 1 }}
                >
                  Current View
                </Button>
                <Button
                  variant={
                    searchScope === "dataset"
                      ? Variant.Primary
                      : Variant.Secondary
                  }
                  size={Size.Sm}
                  onClick={() => setSearchScope("dataset")}
                  style={{ flex: 1 }}
                >
                  Full Dataset
                </Button>
              </Stack>
            }
          />
        )}

        {/* Distance field */}
        <FormField
          label="Distance field (optional)"
          description="Store distances as a sample field"
          control={
            <Input
              placeholder="e.g., similarity_dist"
              value={distField}
              onChange={(e) => setDistField(e.target.value)}
              size={Size.Sm}
            />
          }
        />

        {/* Run name */}
        <FormField
          label="Run name (optional)"
          control={
            <Input
              placeholder="My search"
              value={runName}
              onChange={(e) => setRunName(e.target.value)}
              size={Size.Sm}
            />
          }
        />

        {/* Submit with execution target selector */}
        <div className="flex justify-end">
          <OperatorExecutionButton
            operatorUri={SEARCH_OPERATOR_URI}
            executionParams={executionParams}
            onSuccess={handleSuccess}
            onError={handleError}
            disabled={
              !canSubmitSearch(
                brainKey,
                queryType,
                textQuery,
                getQueryIds().length
              )
            }
            variant="contained"
          >
            Search
          </OperatorExecutionButton>
        </div>
      </Stack>
    </div>
  );
}
