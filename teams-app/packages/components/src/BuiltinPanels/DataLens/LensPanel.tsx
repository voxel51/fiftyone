import React, {
  Fragment,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  FormControl,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { FormState, OperatorConfigurator } from "./OperatorConfigurator";
import { useOperatorExecutor } from "@fiftyone/operators";
import {
  ImportRequest,
  LensConfig,
  OperatorResponse,
  PreviewRequest,
  PreviewResponse,
} from "./models";
import { Lens } from "./Lens";
import { ImportDialog } from "./ImportDialog";
import { useDatasets } from "./hooks";
import { OperatorResult } from "@fiftyone/operators/src/operators";

// Internal state.
type PanelState = {
  isQueryExpanded?: boolean;
  isPreviewExpanded?: boolean;
  isImportShown?: boolean;
  isImportExpanded?: boolean;
};

// Reducer type.
type StateUpdateType = "update" | "reset";
// Reducer type.
type PanelStateUpdate = PanelState & { type: StateUpdateType };

// Internal state reducer.
const panelStateReducer = (
  state: PanelState,
  action: PanelStateUpdate
): PanelState => {
  switch (action.type) {
    case "update": {
      const { type, ...rest } = action;
      return {
        ...state,
        ...rest,
      };
    }

    case "reset": {
      return {
        isQueryExpanded: true,
        isPreviewExpanded: false,
        isImportShown: false,
        isImportExpanded: false,
      };
    }

    default: {
      console.warn(`Unhandled action: ${action.type}`);
      return { ...state };
    }
  }
};

/**
 * Component responsible for handling query and preview functionality.
 */
export const LensPanel = ({
  lensConfigs,
  onError,
}: {
  lensConfigs: LensConfig[];
  onError: (message: string) => void;
}) => {
  // General state
  const [activeConfig, setActiveConfig] = useState<LensConfig>(lensConfigs[0]);
  const [formState, setFormState] = useState<FormState>({});
  const [isFormValid, setIsFormValid] = useState(false);
  const [panelState, dispatchPanelStateUpdate] = useReducer(panelStateReducer, {
    isQueryExpanded: true,
  });
  const dispatchPanelUpdate = useCallback(
    (update: PanelState) => {
      dispatchPanelStateUpdate({
        type: "update",
        ...update,
      });
    },
    [dispatchPanelStateUpdate]
  );

  // Preview state
  const [maxSamples, setMaxSamples] = useState(25);
  const [searchResponse, setSearchResponse] = useState<PreviewResponse>();
  const [isOperatorConfigReady, setIsOperatorConfigReady] = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const resetPanelState = useCallback(() => {
    dispatchPanelStateUpdate({ type: "reset" });
    setSearchResponse(null);
    setIsImportEnabled(false);
  }, [dispatchPanelStateUpdate, setSearchResponse]);

  // Import state
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [importTime, setImportTime] = useState(0);
  const [isImportEnabled, setIsImportEnabled] = useState(false);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [destDatasetName, setDestDatasetName] = useState("");
  const { datasets, activeDataset } = useDatasets();
  const [isDelegatedImport, setIsDelegatedImport] = useState(false);

  const previewStartTime = useRef(0);
  const importStartTime = useRef(0);

  // State to keep sticky footer sized appropriately
  const mainContentRef = useRef(null);
  const mainContentWidth = mainContentRef.current?.offsetWidth ?? 0;

  // Check to see if our active config still exists.
  // This handles the case where a user has deleted a config that was previously active.
  if (activeConfig?.id) {
    if (lensConfigs.findIndex((cfg) => cfg.id === activeConfig.id) < 0) {
      setActiveConfig(lensConfigs[0]);
    }
  }

  const searchOperator = useOperatorExecutor(
    "@voxel51/operators/lens_datasource_connector"
  );

  const openDatasetOperator = useOperatorExecutor(
    "@voxel51/operators/open_dataset"
  );

  const reloadDatasetOperator = useOperatorExecutor(
    "@voxel51/operators/reload_dataset"
  );

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

    // Any changes to the form invalidate the preview and thus disable import
    setIsImportEnabled(false);
    dispatchPanelUpdate({
      isImportShown: false,
    });
  };

  // Callback which handles updates to the selected lens configuration.
  const handleLensConfigChange = (id: string) => {
    const config = lensConfigs.find((cfg) => cfg.id === id);
    if (config) {
      setActiveConfig(config);
      handleFormStateChange({}, false);
      resetPanelState();
    }
  };

  // Callback which handles executing a search and parsing the response.
  const doSearch = async () => {
    // Operator request parameters.
    const request: PreviewRequest = {
      search_params: { ...formState },
      operator_uri: activeConfig.operator_uri,
      batch_size: maxSamples,
      max_results: maxSamples,
      request_type: "preview",
    };

    // Callback which handles the response from the operator.
    const callback = (response: OperatorResponse<PreviewResponse>) => {
      setPreviewTime(new Date().getTime() - previewStartTime.current);
      setSearchResponse(response.result);
      setIsPreviewLoading(false);

      // Enable import if any samples were returned
      setIsImportEnabled(response.result?.result_count > 0);

      if (response.error || response.result?.error) {
        onError(response.error || response.result?.error);
      }
    };

    setSearchResponse(null);
    setIsPreviewLoading(true);
    dispatchPanelUpdate({
      isQueryExpanded: false,
      isPreviewExpanded: true,
      isImportShown: false,
    });
    previewStartTime.current = new Date().getTime();

    await searchOperator.execute(request, { callback });
  };

  const importRequestParams: Pick<
    ImportRequest,
    "operator_uri" | "search_params" | "batch_size"
  > = useMemo(() => {
    // Limit batches to ~10 MB. Figure out if this is a reasonable number.
    const maxBatchMB = 10;
    const maxBatchBytes = maxBatchMB * (1 << 20);
    const importBatchSize = Math.max(
      1,
      Math.floor(maxBatchBytes / averageSampleSize)
    );

    return {
      operator_uri: activeConfig.operator_uri,
      search_params: { ...formState },
      batch_size: importBatchSize,
    };
  }, [activeConfig, averageSampleSize, formState]);

  const onImportStart = (isDelegated: boolean, datasetName: string) => {
    setImportTime(0);
    setIsImportLoading(true);
    setDestDatasetName(datasetName);
    setIsDelegatedImport(isDelegated);
    importStartTime.current = new Date().getTime();

    dispatchPanelUpdate({
      isQueryExpanded: false,
      isPreviewExpanded: false,
      isImportShown: true,
      isImportExpanded: true,
    });

    setIsImportDialogOpen(false);
  };

  const onImportSuccess: (result: OperatorResult) => void = (
    result: OperatorResult
  ) => {
    setImportTime(new Date().getTime() - importStartTime.current);
    setIsImportLoading(false);
  };

  // Callback which opens the target dataset.
  const openDataset = async () => {
    if (destDatasetName === activeDataset) {
      await reloadDatasetOperator.execute({});
    } else {
      await openDatasetOperator.execute({ dataset: destDatasetName });
    }
  };

  // Callback which opens the import dialog.
  const openImportDialog = () => {
    setIsImportDialogOpen(true);
    setImportTime(0);
    setDestDatasetName("");
  };

  // LensConfig selection.
  const lensConfigContent = (
    <Box>
      <Typography sx={{ mb: 1 }}>Select a data source</Typography>

      <Select
        fullWidth
        variant="outlined"
        value={activeConfig?.id}
        onChange={(e) => handleLensConfigChange(e.target.value)}
      >
        {lensConfigs.map((cfg) => (
          <MenuItem key={cfg.id} value={cfg.id}>
            {cfg.name}
          </MenuItem>
        ))}
      </Select>
    </Box>
  );

  // Operator (search) configuration.
  const queryOperatorContent = (
    <Box sx={{ mt: 4 }}>
      <Accordion expanded={panelState.isQueryExpanded}>
        <AccordionSummary
          expandIcon={
            isOperatorConfigReady ? (
              <ExpandMoreIcon />
            ) : (
              <CircularProgress size="1.5rem" />
            )
          }
          onClick={() =>
            dispatchPanelUpdate({
              isQueryExpanded: !panelState.isQueryExpanded,
              isImportShown: false,
            })
          }
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6">Query parameters</Typography>
            <Typography>&bull;</Typography>
            <Typography color="secondary">
              {Object.keys(formState)
                .map((k) => (formState[k] ? 1 : 0))
                .reduce((l, r) => l + r, 0)}{" "}
              filters applied
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          <OperatorConfigurator
            operator={activeConfig?.operator_uri}
            formState={formState}
            onStateChange={handleFormStateChange}
            onReadyChange={setIsOperatorConfigReady}
          />
        </AccordionDetails>
      </Accordion>
    </Box>
  );

  // Additional search controls.
  const getSearchControls = () => {
    const isPreviewButtonEnabled =
      isFormValid && !isPreviewLoading && maxSamples > 0;

    const numSamplesInput = (
      <FormControl>
        <TextField
          label="Number of preview samples"
          value={maxSamples}
          onChange={(e) =>
            setMaxSamples(
              isNaN(Number.parseInt(e.target.value))
                ? 25
                : Number.parseInt(e.target.value)
            )
          }
        />
      </FormControl>
    );

    if (panelState.isImportShown) {
      // Show new query button
      return (
        <Button
          fullWidth
          variant="contained"
          onClick={resetPanelState}
          disabled={isImportLoading}
        >
          Start a new query
        </Button>
      );
    } else if (isImportEnabled) {
      // Import button as main CTA, preview button as secondary
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center">
            {numSamplesInput}

            <Button
              variant="outlined"
              color="secondary"
              sx={{ height: "fit-content" }}
              disabled={!isPreviewButtonEnabled}
              onClick={doSearch}
            >
              Preview data
            </Button>
          </Stack>

          <Button variant="contained" onClick={openImportDialog}>
            Import data
          </Button>
        </Box>
      );
    } else {
      // In query/preview mode; preview button as main CTA
      return (
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography color="secondary">
            Try a preview &rarr; import unlimited samples
          </Typography>

          <Stack direction="row" spacing={2} alignItems="center">
            {numSamplesInput}

            <Button
              variant="contained"
              sx={{ height: "fit-content" }}
              disabled={!isPreviewButtonEnabled}
              onClick={doSearch}
            >
              Preview data
            </Button>
          </Stack>
        </Box>
      );
    }
  };

  const searchControls = <Box sx={{ m: 2 }}>{getSearchControls()}</Box>;

  // Sample preview.
  const previewContent = searchResponse ? (
    <Box sx={{ mt: 4 }}>
      <Accordion expanded={panelState.isPreviewExpanded}>
        <AccordionSummary
          expandIcon={<ExpandMoreIcon />}
          onClick={() =>
            dispatchPanelUpdate({
              isPreviewExpanded: !panelState.isPreviewExpanded,
              isImportShown: false,
            })
          }
        >
          <Stack direction="row" alignItems="center" spacing={2}>
            <Typography variant="h6">Preview</Typography>
            <Typography>&bull;</Typography>
            <Typography color="secondary">
              {(previewTime / 1000).toLocaleString(undefined, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })}{" "}
              seconds
            </Typography>
          </Stack>
        </AccordionSummary>
        <AccordionDetails>
          {searchResponse.result_count > 0 ? (
            <Box sx={{ m: 2 }}>
              <Lens
                samples={searchResponse.query_result}
                sampleSchema={searchResponse.field_schema}
              />
            </Box>
          ) : (
            <Box>
              <Typography textAlign="center" color="secondary">
                No results found
              </Typography>
            </Box>
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  ) : isPreviewLoading ? (
    <Box sx={{ mt: 4 }}>
      <Accordion expanded={panelState.isPreviewExpanded}>
        <AccordionSummary
          expandIcon={<CircularProgress size="1.5rem" />}
          onClick={() =>
            dispatchPanelUpdate({
              isPreviewExpanded: !panelState.isPreviewExpanded,
              isImportShown: false,
            })
          }
        >
          <Typography variant="h6">Preview</Typography>
        </AccordionSummary>
        <AccordionDetails></AccordionDetails>
      </Accordion>
    </Box>
  ) : (
    <Fragment />
  );

  const importDetails = (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {isDelegatedImport ? (
        <>
          <Box
            sx={{
              borderLeft: "3px solid var(--fo-palette-primary-main)",
              display: "flex",
              alignItems: "center",
              pl: 1,
            }}
          >
            <Typography color="secondary">
              You've scheduled an import to {destDatasetName}.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            color="secondary"
            href={`/datasets/${activeDataset}/runs`}
          >
            View status
          </Button>
        </>
      ) : (
        <>
          <Box
            sx={{
              borderLeft: "3px solid var(--fo-palette-success-main)",
              display: "flex",
              alignItems: "center",
              pl: 1,
            }}
          >
            <CheckCircleOutlineIcon sx={{ mr: 1 }} color="success" />
            <Typography color="secondary">
              Samples were added to {destDatasetName}
            </Typography>
          </Box>

          <Button variant="outlined" color="secondary" onClick={openDataset}>
            View samples
          </Button>
        </>
      )}
    </Box>
  );

  // Import status
  const importContent =
    panelState.isImportShown && (isImportLoading || importTime > 0) ? (
      <Box sx={{ mt: 4 }}>
        <Accordion expanded={panelState.isImportExpanded}>
          <AccordionSummary
            expandIcon={
              isImportLoading ? (
                <CircularProgress size="1.5rem" />
              ) : (
                <ExpandMoreIcon />
              )
            }
            onClick={() =>
              dispatchPanelUpdate({
                isImportExpanded: !panelState.isImportExpanded,
              })
            }
          >
            {isImportLoading ? (
              <Typography>Importing data</Typography>
            ) : (
              <Stack direction="row" alignItems="center" spacing={2}>
                <Typography variant="h6">
                  Data import {isDelegatedImport ? "scheduled" : "complete"}
                </Typography>
                <Typography>&bull;</Typography>
                <Typography color="secondary">
                  {(importTime / 1000).toLocaleString(undefined, {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}{" "}
                  seconds
                </Typography>
              </Stack>
            )}
          </AccordionSummary>
          <AccordionDetails>{importTime > 0 && importDetails}</AccordionDetails>
        </Accordion>
      </Box>
    ) : (
      <Fragment />
    );

  // All content.
  return (
    <Box sx={{ m: 2 }}>
      <Box ref={mainContentRef} sx={{ m: "auto", mb: 16 }}>
        <Box sx={{ m: 2 }}>
          {lensConfigContent}
          {queryOperatorContent}
          {previewContent}
          {importContent}
        </Box>
      </Box>

      {/*Sticky footer*/}
      <Box
        sx={{
          position: "fixed",
          width: `${mainContentWidth}px`,
          bottom: 0,
          p: 1,
          m: "auto",
          borderTop: "1px solid var(--fo-palette-divider)",
          background: "var(--fo-palette-background-level2)",
        }}
      >
        {searchControls}
      </Box>

      {/*Placement of this dialog doesn't matter; just needs to be part of the DOM*/}
      <ImportDialog
        open={isImportDialogOpen}
        datasets={datasets}
        onClose={() => setIsImportDialogOpen(false)}
        onCancel={() => setIsImportDialogOpen(false)}
        requestParams={importRequestParams}
        onStart={onImportStart}
        onSuccess={onImportSuccess}
        onError={(e) => onError?.(`${e}`)}
      />
    </Box>
  );
};
