import { useOperatorExecutor } from "@fiftyone/operators";
import { OperatorResult } from "@fiftyone/operators/src/operators";
import React, {
  Fragment,
  useCallback,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  Box,
  CircularProgress,
  MenuItem,
  Select,
  Typography,
} from "@mui/material";
import { ImportDialog } from "./ImportDialog";
import { FormState } from "./OperatorConfigurator";
import { useDatasets, useSampleSchemaGenerator } from "./hooks";
import {
  ImportRequest,
  LensConfig,
  OperatorResponse,
  PreviewRequest,
  PreviewResponse,
} from "./models";
import { LensQuery } from "./LensQuery";
import { LensPreview } from "./LensPreview";
import { FooterVariant, LensFooter } from "./LensFooter";
import { LensImport } from "./LensImport";

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
  const [previewError, setPreviewError] = useState(null);

  const cleanedSchema = useSampleSchemaGenerator({
    baseSchema: searchResponse?.field_schema ?? {},
  });

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

  const searchOperator = useOperatorExecutor(
    "@voxel51/panels/lens_datasource_connector"
  );

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

      setPreviewError(response.error ?? response.result?.error);
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
    if (result?.result?.error) {
      onError?.(result.result.error);
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

  // Query parameters.
  const queryOperatorContent = (
    <LensQuery
      expanded={panelState.isQueryExpanded}
      expandIcon={
        isOperatorConfigReady ? (
          <ExpandMoreIcon />
        ) : (
          <CircularProgress size="1.5rem" />
        )
      }
      operatorUri={activeConfig.operator_uri}
      formState={formState}
      onHeaderClick={() =>
        dispatchPanelUpdate({
          isQueryExpanded: !panelState.isQueryExpanded,
          isImportShown: false,
        })
      }
      onStateChange={handleFormStateChange}
      onReadyChange={setIsOperatorConfigReady}
    />
  );

  // Sample preview.
  const previewContent = (
    <LensPreview
      expanded={panelState.isPreviewExpanded}
      onHeaderClick={() =>
        dispatchPanelUpdate({
          isPreviewExpanded: !panelState.isPreviewExpanded,
          isImportShown: false,
        })
      }
      loading={isPreviewLoading}
      previewTime={previewTime}
      searchResponse={searchResponse}
      schema={cleanedSchema}
      previewError={previewError}
    />
  );

  // Sample import status.
  const importContent =
    panelState.isImportShown && (isImportLoading || importTime > 0) ? (
      <LensImport
        expanded={panelState.isImportExpanded}
        loading={isImportLoading}
        onHeaderClick={() =>
          dispatchPanelUpdate({
            isImportExpanded: !panelState.isImportExpanded,
          })
        }
        isDelegated={isDelegatedImport}
        importTime={importTime}
        activeDatasetName={activeDataset}
        destinationDatasetName={destDatasetName}
      />
    ) : (
      <Fragment />
    );

  const getFooterVariant = (): FooterVariant => {
    if (panelState.isImportShown) {
      return "reset";
    } else if (isImportEnabled) {
      return "import-cta";
    } else {
      return "preview-cta";
    }
  };

  // All content.
  return (
    <Box sx={{ minWidth: "450px", m: "auto" }}>
      <Box ref={mainContentRef} sx={{ m: "auto", mb: 16 }}>
        {lensConfigContent}
        {queryOperatorContent}
        {previewContent}
        {importContent}
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
        <LensFooter
          variant={getFooterVariant()}
          loading={isPreviewLoading || isImportLoading}
          isPreviewEnabled={isFormValid && !isPreviewLoading && maxSamples > 0}
          maxSamples={maxSamples}
          onMaxSamplesChange={(v) => v && setMaxSamples(parseInt(v))}
          onResetClick={resetPanelState}
          onPreviewClick={doSearch}
          onImportClick={openImportDialog}
        />
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
