import { ArrowBackIcon as ArrowBack } from "../../mui";
import {
  Button,
  FormField,
  Heading,
  Input,
  InputType,
  RadioGroup,
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
import { BrainKeyConfig, CloneConfig, QueryType } from "../../types";
import { SEARCH_OPERATOR_URI, INIT_RUN_OPERATOR_URI } from "../../constants";
import { canSubmitSearch, buildExecutionParams } from "../../utils";
import * as s from "../styles";

type NewSearchProps = {
  brainKeys: BrainKeyConfig[];
  cloneConfig?: CloneConfig | null;
  isPatchesView?: boolean;
  onBack: () => void;
  onSubmitted: () => void;
};

const BackIcon = () => <ArrowBack fontSize="small" />;

export default function NewSearch({
  brainKeys,
  cloneConfig,
  isPatchesView = false,
  onBack,
  onSubmitted,
}: NewSearchProps) {
  const selectedSamples = useRecoilValue(fos.selectedSamples);
  const selectedLabels = useRecoilValue(fos.selectedLabels);
  const view = useRecoilValue(fos.view);

  const hasSamplesSelected = useMemo(
    () =>
      (selectedLabels && selectedLabels.length > 0) ||
      (selectedSamples && selectedSamples.size > 0),
    [selectedSamples, selectedLabels]
  );

  // Find the first brain key that supports text prompts
  const firstTextKey = useMemo(
    () => brainKeys.find((bk) => bk.supports_prompts),
    [brainKeys]
  );

  // Default brain key + query type based on context
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
  const [searchScope, setSearchScope] = useState<"view" | "dataset">(
    isPatchesView ? "view" : "view"
  );

  const { execute: initRun } = useOperatorExecutor(INIT_RUN_OPERATOR_URI);

  // Get config for selected brain key
  const selectedConfig = brainKeys.find((bk) => bk.key === brainKey);
  const supportsPrompts = selectedConfig?.supports_prompts ?? false;
  const supportsLeast = selectedConfig?.supports_least_similarity ?? true;

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

  const queryIds = useMemo(() => {
    if (selectedLabels && selectedLabels.length > 0) {
      return selectedLabels.map((l: any) => l.label_id);
    }
    if (selectedSamples && selectedSamples.size > 0) {
      return Array.from(selectedSamples);
    }
    return [];
  }, [selectedSamples, selectedLabels]);

  // Negative query IDs will be wired in with the alt-selection PR
  const negativeQueryIds: string[] = [];

  // Build the params that will be passed to the operator
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

  // Called when operator execution completes (or is queued for delegation)
  const handleSuccess = useCallback(
    (result: any) => {
      if (result?.delegated) {
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

  const kError = typeof k === "number" && k > 10000;

  return (
    <div style={s.newSearchContainer}>
      <Stack
        orientation={Orientation.Row}
        spacing={Spacing.Sm}
        style={{ alignItems: "center", marginBottom: "1.5rem" }}
      >
        <Button
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
        {/* Similarity index selector */}
        <FormField
          label="Similarity Index"
          control={
            <>
              {/* Index info card */}
              {selectedConfig && (
                <div style={{ ...s.noBrainKeysWarning, marginBottom: 8 }}>
                  <Stack orientation={Orientation.Column} spacing={Spacing.Xs}>
                    {selectedConfig.model && (
                      <Text
                        variant={TextVariant.Md}
                        color={TextColor.Secondary}
                      >
                        Model: {selectedConfig.model}
                      </Text>
                    )}
                    {selectedConfig.backend && (
                      <Text
                        variant={TextVariant.Md}
                        color={TextColor.Secondary}
                      >
                        Backend: {selectedConfig.backend}
                      </Text>
                    )}
                    <Text variant={TextVariant.Md} color={TextColor.Secondary}>
                      Supports text queries?{" "}
                      {selectedConfig.supports_prompts ? "\u2705" : "\u274C"}
                    </Text>
                  </Stack>
                </div>
              )}
              <Select
                exclusive
                options={brainKeyOptions}
                value={brainKey}
                onChange={(value) => setBrainKey((value as string) ?? "")}
              />
            </>
          }
        />

        {brainKeys.length === 0 && (
          <div style={s.noBrainKeysWarning}>
            <Text variant={TextVariant.Md} color={TextColor.Secondary}>
              No similarity indexes found. Compute a similarity index on your
              dataset first.
            </Text>
          </div>
        )}

        {/* Search scope */}
        <FormField
          label="Search scope"
          control={
            <RadioGroup
              options={
                isPatchesView
                  ? [
                      { value: "dataset", label: "All Patches" },
                      { value: "view", label: "Current Patches View" },
                    ]
                  : [
                      { value: "dataset", label: "Full Dataset" },
                      { value: "view", label: "Current View" },
                    ]
              }
              value={searchScope}
              onChange={(value) => setSearchScope(value as "view" | "dataset")}
              size={Size.Sm}
              style={{ display: "flex", flexDirection: "row", gap: "1rem" }}
            />
          }
        />

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
              Text Search
            </Button>
            <Button
              variant={
                queryType === "image" ? Variant.Primary : Variant.Secondary
              }
              size={Size.Sm}
              onClick={() => setQueryType("image")}
              style={{ flex: 1 }}
            >
              Image Search
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
            style={
              queryIds.length > 0
                ? s.querySelectorBoxActive
                : s.querySelectorBoxInactive
            }
          >
            <Text
              variant={TextVariant.Sm}
              color={
                queryIds.length > 0 ? TextColor.Success : TextColor.Secondary
              }
            >
              {queryIds.length > 0
                ? `${queryIds.length} ${
                    selectedLabels?.length > 0 ? "labels" : "samples"
                  } selected (positive)`
                : "Select samples in the grid"}
            </Text>
          </div>
        )}

        {/* Number of matches */}
        <FormField
          label="Number of matches"
          error={kError ? "Exceeds maximum of 10,000" : undefined}
          control={
            <Input
              type={InputType.Number}
              value={k === "" ? "" : String(k)}
              onChange={(e) => {
                const val = e.target.value;
                setK(val === "" ? "" : parseInt(val, 10));
              }}
              min={1}
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

        {/* Search name */}
        <FormField
          label="Search name (optional)"
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
        <div style={s.submitRow}>
          <OperatorExecutionButton
            operatorUri={SEARCH_OPERATOR_URI}
            executionParams={executionParams}
            onSuccess={handleSuccess}
            onError={handleError}
            disabled={
              !canSubmitSearch(brainKey, queryType, textQuery, queryIds.length)
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
