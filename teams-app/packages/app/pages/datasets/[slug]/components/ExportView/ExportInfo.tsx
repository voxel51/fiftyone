import { useExportVariables, useExportView } from "@fiftyone/hooks";
import { Box } from "@fiftyone/teams-components";
import {
  CONSTANT_VARIABLES,
  DatasetExportEstimateQuery,
  DatasetSnapshotExportEstimateQuery,
  exportMode,
} from "@fiftyone/teams-state";
import { Alert, AlertTitle, Typography } from "@mui/material";
import bytes from "bytes";
import { useEffect, useMemo } from "react";
import { useLazyLoadQuery } from "react-relay";
import { useRecoilValue } from "recoil";
const { MAX_EXPORT_SIZE } = CONSTANT_VARIABLES;

export default function ExportInfo() {
  const mode = useRecoilValue(exportMode);
  const { setSize, canExport } = useExportView();
  const variables = useExportVariables(true);
  const estimateResponse = useLazyLoadQuery(
    variables.snapshot
      ? DatasetSnapshotExportEstimateQuery
      : DatasetExportEstimateQuery,
    variables
  );
  const { snapshot } = variables;
  const exportSize = useMemo(() => {
    const datasetOrSnapshot = snapshot
      ? estimateResponse?.dataset?.snapshot
      : estimateResponse?.dataset;
    return datasetOrSnapshot?.sizeEstimate;
  }, [estimateResponse, snapshot]);
  const showWarning = mode === "direct" && !canExport;

  useEffect(() => {
    setSize(exportSize);
  }, [exportSize]);

  if (exportSize === null)
    return (
      <Alert severity="error" variant="outlined" sx={{ mt: 2 }}>
        <AlertTitle>Failed to estimate the size of the export</AlertTitle>
        <Typography variant="caption">
          Something went wrong. Please try again.
        </Typography>
      </Alert>
    );

  return (
    <Box sx={{ mt: 2 }}>
      {showWarning && (
        <Alert severity="warning" variant="outlined">
          <AlertTitle>
            This dataset is too big to download on the web
          </AlertTitle>
          <Typography variant="caption">
            Use filters to create a set of samples under {MAX_EXPORT_SIZE}, or
            use code to download it locally
          </Typography>
        </Alert>
      )}
      {!showWarning && (
        <Alert severity="info" variant="outlined">
          <Typography variant="caption">
            Estimated export size: {bytes.format(exportSize)}
          </Typography>
        </Alert>
      )}
    </Box>
  );
}
