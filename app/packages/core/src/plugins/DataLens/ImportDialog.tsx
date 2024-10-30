import {
  Box,
  Button,
  MenuItem,
  Select,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { Dialog } from "@fiftyone/components";
import React, { useState } from "react";
import { useRecoilValue } from "recoil";
import { datasetName as fosDatasetName } from "@fiftyone/state";

/**
 * Data model for input to dialog CTA handler.
 */
export type ImportDialogData = {
  datasetName: string;
  maxSamples: number;
};

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
  onCancel,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  datasets: string[];
  onCancel: () => void;
  onImport: (data: ImportDialogData) => void;
}) => {
  const activeDataset = useRecoilValue(fosDatasetName);
  const [datasetName, setDatasetName] = useState(activeDataset);
  const [importLimitType, setImportLimitType] = useState<ImportLimitType>(
    "limit"
  );
  const [destDatasetType, setDestDatasetType] = useState<DestDatasetType>(
    "existing"
  );
  const [maxImportSamples, setMaxImportSamples] = useState(defaultMaxSamples);

  // Callback which handles updates to the import destination dataset type
  const handleDestDatasetTypeChange = (value?: DestDatasetType) => {
    if (value) {
      setDestDatasetType(value);
      // Default to active dataset for existing dataset, else empty string
      const defaultDest = value === "existing" ? activeDataset : "";
      setDatasetName(defaultDest);
    }
  };

  const handleImportClick = () => {
    onImport({
      datasetName,
      maxSamples: importLimitType === "limit" ? maxImportSamples : 0,
    });
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <Box sx={{ m: 2, maxWidth: "400px" }}>
        <Typography variant="h5">Import data to a Dataset</Typography>

        {/*Number of samples*/}
        <Box sx={{ mt: 3 }}>
          <Box>
            <Typography sx={{ mb: 2 }}>Sample size</Typography>
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

        {/*Dialog actions*/}
        <Box sx={{ mt: 5, display: "flex", justifyContent: "space-between" }}>
          <Button variant="contained" color="secondary" onClick={onCancel}>
            Cancel
          </Button>

          <Button
            variant="contained"
            endIcon={<ExpandMoreIcon />}
            disabled={!datasetName}
            onClick={handleImportClick}
          >
            Import data
          </Button>
        </Box>
      </Box>
    </Dialog>
  );
};
