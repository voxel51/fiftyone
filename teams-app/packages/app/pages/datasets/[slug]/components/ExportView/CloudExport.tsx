import { Box } from "@fiftyone/teams-components";
import { CONSTANT_VARIABLES } from "@fiftyone/teams-state";
import { Link, Typography } from "@mui/material";
import CloudStoragePathInput from "./CloudStoragePathInput";
import CloudExportButton from "./CloudExportButton";
import ExportForm from "./ExportForm";
const { CLOUD_EXPORT_LINK } = CONSTANT_VARIABLES;

export default function CloudExport() {
  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ mb: 2 }}>
        You can export directly to cloud buckets without downloading to your
        local machine.
      </Typography>
      <CloudStoragePathInput />
      <ExportForm />
      <CloudExportButton />
    </Box>
  );
}
