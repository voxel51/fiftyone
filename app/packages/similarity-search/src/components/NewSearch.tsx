import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  Box,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import {
  OperatorExecutionButton,
  useOperatorExecutor,
} from "@fiftyone/operators";
import * as fos from "@fiftyone/state";
import { BrainKeyConfig, CloneConfig, QueryType } from "../types";

const SEARCH_OPERATOR_URI = "@voxel51/panels/similarity_search";
const INIT_RUN_OPERATOR_URI = "@voxel51/panels/init_similarity_run";

type NewSearchProps = {
  brainKeys: BrainKeyConfig[];
  cloneConfig?: CloneConfig | null;
  onBack: () => void;
  onSubmitted: () => void;
};

export default function NewSearch({
  brainKeys,
  cloneConfig,
  onBack,
  onSubmitted,
}: NewSearchProps) {
  const selectedSamples = useRecoilValue(fos.selectedSamples);
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

  const canSubmit = useCallback(() => {
    if (!brainKey) return false;
    if (queryType === "text" && !textQuery.trim()) return false;
    if (queryType === "image" && getQueryIds().length === 0) return false;
    return true;
  }, [brainKey, queryType, textQuery, getQueryIds]);

  // Build the params that will be passed to the operator
  const executionParams = useMemo(() => {
    const query = queryType === "text" ? textQuery.trim() : getQueryIds();

    const params: Record<string, any> = {
      brain_key: brainKey,
      query_type: queryType,
      query,
      reverse,
      patches_field: selectedConfig?.patches_field,
      source_view: view,
    };

    if (k !== "") params.k = k;
    if (distField.trim()) params.dist_field = distField.trim();
    if (runName.trim()) params.run_name = runName.trim();

    return params;
  }, [
    brainKey,
    queryType,
    textQuery,
    k,
    reverse,
    distField,
    runName,
    selectedConfig,
    view,
    getQueryIds,
  ]);

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

  return (
    <Box sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 3 }}>
        <IconButton size="small" onClick={onBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h6">
          {cloneConfig ? "Clone Search" : "New Search"}
        </Typography>
      </Stack>

      <Stack spacing={2.5}>
        {/* Brain key selector */}
        <FormControl fullWidth size="small">
          <InputLabel>Brain Key</InputLabel>
          <Select
            value={brainKey}
            label="Brain Key"
            onChange={(e) => setBrainKey(e.target.value)}
          >
            {brainKeys.map((bk) => (
              <MenuItem key={bk.key} value={bk.key}>
                {bk.key}
                {bk.patches_field ? ` (patches: ${bk.patches_field})` : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {brainKeys.length === 0 && (
          <Alert severity="info">
            No similarity brain keys found. Run{" "}
            <code>dataset.compute_similarity()</code> first to create an index.
          </Alert>
        )}

        {/* Query type toggle */}
        {supportsPrompts && (
          <ToggleButtonGroup
            value={queryType}
            exclusive
            onChange={(_, val) => val && setQueryType(val)}
            size="small"
            fullWidth
          >
            <ToggleButton value="text">Text Prompt</ToggleButton>
            <ToggleButton value="image">Image Similarity</ToggleButton>
          </ToggleButtonGroup>
        )}

        {/* Query input */}
        {queryType === "text" ? (
          <TextField
            label="Text query"
            placeholder="Enter a text prompt..."
            value={textQuery}
            onChange={(e) => setTextQuery(e.target.value)}
            size="small"
            fullWidth
            multiline
            maxRows={3}
          />
        ) : (
          <Alert
            severity={getQueryIds().length > 0 ? "success" : "warning"}
            variant="outlined"
          >
            {getQueryIds().length > 0
              ? `${getQueryIds().length} ${
                  selectedLabels?.length > 0 ? "labels" : "samples"
                } selected`
              : "Select samples or labels in the grid to use as the query"}
          </Alert>
        )}

        {/* K value */}
        <TextField
          label={`Number of results (k)${maxK ? ` (max: ${maxK})` : ""}`}
          type="number"
          value={k}
          onChange={(e) => {
            const val = e.target.value;
            setK(val === "" ? "" : parseInt(val, 10));
          }}
          size="small"
          fullWidth
          inputProps={{ min: 1, max: maxK ?? undefined }}
          helperText={
            maxK && typeof k === "number" && k > maxK
              ? `Exceeds max k of ${maxK}`
              : undefined
          }
          error={maxK != null && typeof k === "number" && k > maxK}
        />

        {/* Reverse toggle */}
        {supportsLeast && (
          <FormControlLabel
            control={
              <Switch
                checked={reverse}
                onChange={(e) => setReverse(e.target.checked)}
                size="small"
              />
            }
            label="Least similar (reverse)"
          />
        )}

        {/* Distance field */}
        <TextField
          label="Distance field (optional)"
          placeholder="e.g., similarity_dist"
          value={distField}
          onChange={(e) => setDistField(e.target.value)}
          size="small"
          fullWidth
          helperText="Store distances as a sample field"
        />

        {/* Run name */}
        <TextField
          label="Run name (optional)"
          placeholder="My search"
          value={runName}
          onChange={(e) => setRunName(e.target.value)}
          size="small"
          fullWidth
        />

        {/* Submit with execution target selector */}
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <OperatorExecutionButton
            operatorUri={SEARCH_OPERATOR_URI}
            executionParams={executionParams}
            onSuccess={handleSuccess}
            onError={handleError}
            disabled={!canSubmit()}
            variant="contained"
          >
            Search
          </OperatorExecutionButton>
        </Box>
      </Stack>
    </Box>
  );
}
