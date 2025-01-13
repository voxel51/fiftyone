import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import React from "react";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { useOperatorExecutor } from "@fiftyone/operators";

const ImportDetails = ({
  isDelegated,
  activeDatasetName,
  destinationDatasetName,
}: {
  isDelegated: boolean;
  activeDatasetName: string;
  destinationDatasetName: string;
}) => {
  const openDatasetOperator = useOperatorExecutor(
    "@voxel51/operators/open_dataset"
  );

  const reloadDatasetOperator = useOperatorExecutor(
    "@voxel51/operators/reload_dataset"
  );

  // Callback which opens the target dataset.
  const openDataset = async () => {
    if (destinationDatasetName === activeDatasetName) {
      await reloadDatasetOperator.execute({});
    } else {
      await openDatasetOperator.execute({ dataset: destinationDatasetName });
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {isDelegated ? (
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
              You&apos;ve scheduled an import to {destinationDatasetName}.
            </Typography>
          </Box>

          <Button
            variant="outlined"
            color="secondary"
            href={`/datasets/${activeDatasetName}/runs`}
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
              Samples were added to {destinationDatasetName}
            </Typography>
          </Box>

          <Button variant="outlined" color="secondary" onClick={openDataset}>
            View samples
          </Button>
        </>
      )}
    </Box>
  );
};

export const LensImport = ({
  expanded,
  loading,
  onHeaderClick,
  isDelegated,
  importTime,
  activeDatasetName,
  destinationDatasetName,
}: {
  expanded: boolean;
  loading: boolean;
  onHeaderClick: () => void;
  isDelegated: boolean;
  importTime: number;
  activeDatasetName: string;
  destinationDatasetName: string;
}) => {
  return (
    <Box sx={{ mt: 4 }}>
      <Accordion expanded={expanded}>
        <AccordionSummary
          expandIcon={
            loading ? <CircularProgress size="1.5rem" /> : <ExpandMoreIcon />
          }
          onClick={onHeaderClick}
        >
          {loading ? (
            <Typography variant="h6">Importing data</Typography>
          ) : (
            <Stack direction="row" alignItems="center" spacing={2}>
              <Typography variant="h6">
                Data import {isDelegated ? "scheduled" : "complete"}
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
        <AccordionDetails>
          {importTime > 0 && (
            <ImportDetails
              isDelegated={isDelegated}
              activeDatasetName={activeDatasetName}
              destinationDatasetName={destinationDatasetName}
            />
          )}
        </AccordionDetails>
      </Accordion>
    </Box>
  );
};
