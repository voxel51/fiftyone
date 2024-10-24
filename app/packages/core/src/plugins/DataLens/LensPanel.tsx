import React, { Fragment, useEffect, useMemo, useRef, useState } from "react";
import SystemUpdateAltIcon from "@mui/icons-material/SystemUpdateAlt";
import OpenInBrowserIcon from "@mui/icons-material/OpenInBrowser";
import {
  Box,
  Button,
  FormControl,
  Link,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Dialog, Loading } from "@fiftyone/components";
import { FormState, OperatorConfigurator } from "./OperatorConfigurator";
import { useOperatorExecutor } from "@fiftyone/operators";
import {
  ImportRequest,
  ImportResponse,
  LensConfig,
  ListLensConfigsRequest,
  ListLensConfigsResponse,
  OperatorResponse,
  PreviewRequest,
  PreviewResponse,
} from "./models";
import { Lens } from "./Lens";
import { EmptyState } from "./EmptyState";
import { LensConfigManager } from "./LensConfigManager";

/**
 * Main Data Lens panel.
 */
export const LensPanel = () => {
  // General state
  const [lensConfigs, setLensConfigs] = useState<LensConfig[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [activeConfig, setActiveConfig] = useState<LensConfig>(lensConfigs[0]);
  const [formState, setFormState] = useState<FormState>({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [showConfigManager, setShowConfigManager] = useState(false);

  // Preview state
  const [maxSamples, setMaxSamples] = useState(25);
  const [searchResponse, setSearchResponse] = useState<PreviewResponse>();
  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  // Import state
  const [datasetName, setDatasetName] = useState("");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importTime, setImportTime] = useState(0);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [destDatasetName, setDestDatasetName] = useState("");

  // Error state
  const [errorMessage, setErrorMessage] = useState(null);

  const previewStartTime = useRef(0);
  const importStartTime = useRef(0);

  const listConfigsOperator = useOperatorExecutor(
    "@voxel51/operators/lens_list_lens_configs"
  );
  const searchOperator = useOperatorExecutor(
    "@voxel51/operators/lens_datasource_connector"
  );

  const openDatasetOperator = useOperatorExecutor(
    "@voxel51/operators/open_dataset"
  );

  // Callback which handles updates to the list of available configs.
  const handleLensConfigsUpdate = (configs: LensConfig[]) => {
    configs.sort((a, b) => a.name.localeCompare(b.name));
    setLensConfigs(configs);

    // Check to see if our active config still exists.
    // This handles the case where a user has deleted a config that was previously active.
    const isActiveConfigValid =
      activeConfig?.id &&
      configs.findIndex((cfg) => cfg.id === activeConfig.id) >= 0;

    if (!isActiveConfigValid) {
      setActiveConfig(configs?.length > 0 ? configs[0] : null);
    }
  };

  // Load configs on initial render
  useEffect(() => {
    const request: ListLensConfigsRequest = {};

    const callback = (response: OperatorResponse<ListLensConfigsResponse>) => {
      if (!(response.error || response.result?.error)) {
        const configs = response.result?.configs ?? [];
        handleLensConfigsUpdate(configs);
        setIsInitializing(false);
      } else {
        setErrorMessage(response.error || response.result?.error);
      }
    };

    listConfigsOperator.execute(request, { callback });
  }, []);

  // Keep track of the average sample size of our current preview.
  // This will allow us to calculate a reasonable batch size for imports.
  const averageSampleSize = useMemo(() => {
    if ((searchResponse?.result_count ?? 0) > 0) {
      const totalBytes = JSON.stringify(searchResponse.query_result).length;
      return Math.ceil(totalBytes / searchResponse.result_count);
    } else {
      return 1;
    }
  }, [searchResponse]);

  // Callback which handles updates to the user-defined search parameters.
  const handleFormStateChange = (state: FormState, isValid: boolean) => {
    setFormState({ ...state });
    setIsFormValid(isValid);
  };

  // Callback which handles updates to the selected lens configuration.
  const handleLensConfigChange = (name: string) => {
    const config = lensConfigs.find((cfg) => cfg.name === name);
    if (config) {
      setActiveConfig(config);
      handleFormStateChange({}, false);
      setSearchResponse(null);
    }
  };

  // Callback which handles executing a search and parsing the response.
  const doSearch = async () => {
    setSearchResponse(null);

    // Operator request parameters.
    const request: PreviewRequest = {
      search_params: { ...formState },
      operator_uri: activeConfig.operator_uri,
      max_results: maxSamples,
      query_type: "preview",
    };

    // Callback which handles the response from the operator.
    const callback = (response: OperatorResponse<PreviewResponse>) => {
      setPreviewTime(new Date().getTime() - previewStartTime.current);
      setSearchResponse(response.result);
      setIsPreviewLoading(false);

      setErrorMessage(response.error || response.result?.error);
    };

    setIsPreviewLoading(true);
    previewStartTime.current = new Date().getTime();

    await searchOperator.execute(request, { callback });
  };

  // Callback which handles starting an import job.
  const doImport = async () => {
    // Limit batches to ~2 MB. Figure out if this is a reasonable number.
    const maxBatchMB = 2;
    const maxBatchBytes = maxBatchMB * (1 << 20);
    const batchSize = Math.max(
      1,
      Math.floor(maxBatchBytes / averageSampleSize)
    );

    // Operator request parameters.
    const request: ImportRequest = {
      search_params: { ...formState },
      operator_uri: activeConfig.operator_uri,
      batch_size: batchSize,
      query_type: "import",
      dataset_name: datasetName,
    };

    // Callback which handles the response from the operator.
    const callback = (response: OperatorResponse<ImportResponse>) => {
      setImportTime(new Date().getTime() - importStartTime.current);
      setIsImportLoading(false);

      setErrorMessage(response.error || response.result?.error);
    };

    setImportTime(0);
    setIsImportLoading(true);
    setDestDatasetName(datasetName);

    importStartTime.current = new Date().getTime();

    await searchOperator.execute(request, { callback });
  };

  // Callback which opens the target dataset.
  const openDataset = async () => {
    await openDatasetOperator.execute({ dataset: destDatasetName });
  };

  // Callback which opens the import dialog.
  const openImportDialog = () => {
    setIsImportOpen(true);
    setDatasetName("");
    setImportTime(0);
    setDestDatasetName("");
  };

  // Handle edge cases
  if (isInitializing) {
    return <Typography>Initializing...</Typography>;
  } else if (showConfigManager) {
    return (
      <LensConfigManager
        configs={lensConfigs}
        onConfigsChange={handleLensConfigsUpdate}
        onReturnToLens={() => setShowConfigManager(false)}
      />
    );
  } else if (lensConfigs.length === 0) {
    return (
      <EmptyState onManageConfigsClick={() => setShowConfigManager(true)} />
    );
  } else {
    // Render main content.
    // LensConfig selection.
    const lensConfigContent = (
      <Box sx={{ m: 2 }}>
        <Typography sx={{ mb: 2 }}>Select datasource configuration</Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Select
            variant="outlined"
            value={activeConfig.name}
            onChange={(e) => handleLensConfigChange(e.target.value)}
          >
            {lensConfigs.map((cfg) => (
              <MenuItem key={cfg.name} value={cfg.name}>
                {cfg.name}
              </MenuItem>
            ))}
          </Select>

          <Button variant="text" onClick={() => setShowConfigManager(true)}>
            Manage datasources
          </Button>
        </Box>
      </Box>
    );

    // Operator (search) configuration.
    const queryOperatorContent = (
      <Box sx={{ m: 2 }}>
        <Typography sx={{ mb: 2 }}>Query parameters</Typography>
        <Box sx={{ mb: 2, border: "1px solid #333", p: 2 }}>
          <OperatorConfigurator
            operator={activeConfig.operator_uri}
            formState={formState}
            onStateChange={handleFormStateChange}
          />
        </Box>
      </Box>
    );

    // Additional search controls.
    const searchControls = (
      <Box sx={{ m: 2, mt: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Button
            variant="contained"
            disabled={!isFormValid || isPreviewLoading}
            onClick={doSearch}
          >
            Search
          </Button>

          <FormControl>
            <TextField
              variant="outlined"
              label="Number of samples"
              value={maxSamples}
              onChange={(e) =>
                setMaxSamples(
                  isNaN(Number.parseInt(e.target.value))
                    ? 10
                    : Number.parseInt(e.target.value)
                )
              }
            />
          </FormControl>
        </Box>
      </Box>
    );

    // Dataset import.
    const importContent = (
      <>
        <Button variant="contained" onClick={openImportDialog}>
          Import to dataset
        </Button>

        <Dialog open={isImportOpen} onClose={() => setIsImportOpen(false)}>
          <Box sx={{ m: 2 }}>
            <Typography variant="h5">Import data to a Dataset</Typography>

            <Typography sx={{ mt: 2 }}>
              Enter the name of a new or existing dataset
            </Typography>

            <Box
              sx={{
                mt: 2,
                display: "flex",
                alignItems: "center",
              }}
            >
              <TextField
                label="Dataset name"
                type="text"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
              />
            </Box>

            <Stack sx={{ mt: 2 }} direction="row" spacing={2}>
              {importTime > 0 ? (
                <Button
                  variant="contained"
                  startIcon={<OpenInBrowserIcon />}
                  onClick={openDataset}
                >
                  Open dataset
                </Button>
              ) : (
                <Button
                  variant="contained"
                  startIcon={<SystemUpdateAltIcon />}
                  disabled={!datasetName || isImportLoading}
                  onClick={doImport}
                >
                  Import to dataset
                </Button>
              )}

              <Button
                variant="contained"
                color="secondary"
                onClick={() => setIsImportOpen(false)}
              >
                {importTime > 0 ? "Close" : "Cancel"}
              </Button>
            </Stack>
          </Box>
        </Dialog>
      </>
    );

    // Sample preview.
    const previewContent = searchResponse ? (
      <>
        <Box sx={{ m: 2 }}>
          <Box sx={{ mt: 1 }}>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Typography>
                {searchResponse.result_count.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}{" "}
                samples received in{" "}
                {(previewTime / 1000).toLocaleString(undefined, {
                  minimumFractionDigits: 3,
                  maximumFractionDigits: 3,
                })}{" "}
                s
              </Typography>

              {searchResponse.result_count > 0 && importContent}
            </Box>
          </Box>
        </Box>

        {searchResponse.result_count > 0 && (
          <Box sx={{ m: 2 }}>
            <Lens
              samples={searchResponse.query_result}
              sampleSchema={searchResponse.field_schema}
            />
          </Box>
        )}
      </>
    ) : isPreviewLoading ? (
      <>
        <Box sx={{ m: 2 }}>
          <Box sx={{ mt: 1 }}>
            <Typography> </Typography>
          </Box>
        </Box>

        <Box
          sx={{
            m: 2,
            border: "1px solid #777",
            width: "100%",
            height: "800px",
          }}
        >
          <Loading>Fetching samples...</Loading>
        </Box>
      </>
    ) : (
      <Fragment />
    );

    const errorContent = errorMessage ? (
      <Snackbar
        open={!!errorMessage}
        onClose={() => setErrorMessage(null)}
        message={errorMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />
    ) : (
      <Fragment />
    );

    // All content.
    const content = (
      <Box sx={{ m: 2 }}>
        <Box sx={{ display: "flex", justifyContent: "end" }}>
          <Typography variant="h6">
            <Link href="https://docs.voxel51.com" target="_blank">
              Need help with Lens?
            </Link>
          </Typography>
        </Box>

        <Box sx={{ maxWidth: "750px", m: "auto", p: 2 }}>
          <Typography sx={{ textAlign: "center", mb: 2 }} variant="h1">
            Data Lens
          </Typography>

          <Typography sx={{ textAlign: "center", mb: 6 }} variant="h6">
            Search your connected datasources directly from FiftyOne
          </Typography>

          {lensConfigContent}
          {queryOperatorContent}
          {searchControls}
        </Box>

        {previewContent}
      </Box>
    );

    return (
      <>
        {content}
        {errorContent}
      </>
    );
  }
};
