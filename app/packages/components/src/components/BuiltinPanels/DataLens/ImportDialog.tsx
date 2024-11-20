import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Dialog, TagsInput } from "@fiftyone/components";
import React, { useMemo, useState } from "react";
import { useRecoilValue } from "recoil";
import { datasetName as fosDatasetName } from "@fiftyone/state";
import { OperatorExecutionButton } from "@fiftyone/operators";
import { ImportRequest } from "./models";
import { OperatorResult } from "@fiftyone/operators/src/operators";

type ImportLimitType = "limit" | "all";
type DestDatasetType = "new" | "existing";

const defaultMaxSamples = 500;

/**
 * Component responsible for rendering the sample import dialog.
 */
export const ImportDialog = ({
  open,
  onClose,
  datasets,
  requestParams,
  onSuccess,
  onError,
  onStart,
  onCancel,
}: {
  open: boolean;
  onClose: () => void;
  datasets: string[];
  requestParams: Pick<
    ImportRequest,
    "search_params" | "batch_size" | "operator_uri"
  >;
  onSuccess?: (result: OperatorResult) => void;
  onError?: (error: Error) => void;
  onStart?: (isDelegated: boolean, destDataset: string) => void;
  onCancel: () => void;
}) => {
  const operatorUri = useMemo(
    () => "@voxel51/operators/lens_datasource_connector",
    []
  );
  const activeDataset: string = useRecoilValue(fosDatasetName);
  const [datasetName, setDatasetName] = useState(activeDataset);
  const [importLimitType, setImportLimitType] =
    useState<ImportLimitType>("limit");
  const [destDatasetType, setDestDatasetType] =
    useState<DestDatasetType>("existing");
  const [maxImportSamples, setMaxImportSamples] = useState(defaultMaxSamples);
  const [sampleTags, setSampleTags] = useState<string[]>([]);
  const [dedupeSamples, setDedupeSamples] = useState(false);

  // Callback which handles updates to the import destination dataset type
  const handleDestDatasetTypeChange = (value?: DestDatasetType) => {
    if (value) {
      setDestDatasetType(value);
      // Default to active dataset for existing dataset, else empty string
      const defaultDest = value === "existing" ? activeDataset : "";
      setDatasetName(defaultDest);
    }
  };

  const importRequest: ImportRequest = useMemo(() => {
    return {
      ...requestParams,
      request_type: "import",
      dataset_name: datasetName,
      max_results: importLimitType === "limit" ? maxImportSamples : 0,
      tags: sampleTags ?? [],
      dedupe_samples: dedupeSamples,
    };
  }, [
    requestParams,
    datasetName,
    importLimitType,
    maxImportSamples,
    sampleTags,
    dedupeSamples,
  ]);

  const handleCloseClick = () => {
    setSampleTags([]);
    onClose();
  };

  const isImportButtonEnabled =
    datasetName && (importLimitType === "all" || maxImportSamples > 0);

  return (
    <Dialog open={open} onClose={handleCloseClick}>
      <Box sx={{ m: 2, maxWidth: "400px" }}>
        <Typography variant="h5">Import data to a Dataset</Typography>

        {/*Number of samples*/}
        <Box sx={{ mt: 3 }}>
          <Box>
            <Typography>Sample size</Typography>
            <ToggleButtonGroup
              color="primary"
              sx={{ mt: 2, mb: 2 }}
              exclusive
              value={importLimitType}
              onChange={(_, val) => val && setImportLimitType(val)}
            >
              <ToggleButton
                value="limit"
                sx={{
                  border: "1px solid #666",
                }}
              >
                Custom
              </ToggleButton>
              <ToggleButton
                value="all"
                sx={{
                  border: "1px solid #666",
                }}
              >
                All samples matching the query parameters
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ mt: 2, minHeight: "5rem" }}>
            {importLimitType === "all" && (
              <Typography color="secondary">
                Depending on the number of samples, the import process may take
                some time to complete. Once the import is in progress, you can
                track its status in the Runs page.
              </Typography>
            )}

            {importLimitType === "limit" && (
              <TextField
                fullWidth
                label="Number of samples"
                value={maxImportSamples}
                onChange={(e) =>
                  setMaxImportSamples(
                    isNaN(Number.parseInt(e.target.value))
                      ? defaultMaxSamples
                      : Number.parseInt(e.target.value)
                  )
                }
              />
            )}
          </Box>

          <FormControlLabel
            sx={{ mt: 1 }}
            control={
              <Checkbox
                checked={dedupeSamples}
                onChange={(_, checked) => setDedupeSamples(checked)}
              />
            }
            label={
              <Stack direction="column" spacing={1}>
                <Typography>Skip existing samples</Typography>
                <Typography color="secondary" variant="body2">
                  Check this box to skip importing examples whose filepath
                  matches an existing dataset sample
                </Typography>
              </Stack>
            }
          />
        </Box>

        {/*Dataset selection*/}
        <Box sx={{ mt: 4 }}>
          <Box>
            <Typography>Import to dataset</Typography>
            <ToggleButtonGroup
              color="primary"
              sx={{ mt: 2, mb: 2 }}
              exclusive
              value={destDatasetType}
              onChange={(_, val) => handleDestDatasetTypeChange(val)}
            >
              <ToggleButton
                value="existing"
                sx={{
                  border: "1px solid #666",
                }}
              >
                Existing
              </ToggleButton>
              <ToggleButton
                value="new"
                sx={{
                  border: "1px solid #666",
                }}
              >
                New dataset
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          <Box sx={{ mt: 2, mb: 2 }}>
            {destDatasetType === "existing" && (
              <Select
                fullWidth
                variant="outlined"
                label="Select a dataset"
                value={datasetName || activeDataset}
                onChange={(e) => setDatasetName(e.target.value)}
              >
                {datasets.map((dataset) => (
                  <MenuItem key={dataset} value={dataset}>
                    {dataset}
                    {activeDataset === dataset && (
                      <Typography
                        sx={{ ml: 2 }}
                        variant="caption"
                        color="secondary"
                      >
                        currently in view
                      </Typography>
                    )}
                  </MenuItem>
                ))}
              </Select>
            )}

            {destDatasetType === "new" && (
              <TextField
                fullWidth
                label="New dataset name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
              />
            )}
          </Box>
        </Box>

        {/*Tags*/}
        <Box sx={{ mt: 3 }}>
          <TagsInput
            direction="v"
            initialValues={[]}
            onChange={(tags) => setSampleTags([...tags])}
            placeholder="Enter tag name(s)"
          />
        </Box>

        {/*Dialog actions*/}
        <Box sx={{ mt: 5, display: "flex", justifyContent: "space-between" }}>
          <Button variant="outlined" color="secondary" onClick={onCancel}>
            Cancel
          </Button>

          <OperatorExecutionButton
            variant="contained"
            endIcon={<ExpandMoreIcon />}
            disabled={!isImportButtonEnabled}
            operatorUri={operatorUri}
            executionParams={importRequest}
            onSuccess={onSuccess}
            onError={onError}
            onOptionSelected={(opt) => onStart(opt.isDelegated, datasetName)}
          >
            Import data
          </OperatorExecutionButton>
        </Box>
      </Box>
    </Dialog>
  );
};
