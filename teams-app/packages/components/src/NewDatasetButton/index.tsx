import { useState } from "react";
import { useCreateDataset, useCurrentUserPermission } from "@fiftyone/hooks";
import { CREATE_DATASETS } from "@fiftyone/teams-state";
import { Button, DatasetModal } from "@fiftyone/teams-components";
import { Box } from "@mui/material";

interface Props {}

export default function NewDatasetButton(props: Props) {
  const [installModalOpen, setInstallModalOpen] = useState<boolean>(false);
  const canCreateDataset = useCurrentUserPermission([CREATE_DATASETS]);

  const { reset: resetAllFields } = useCreateDataset();

  if (!canCreateDataset) {
    return null;
  }

  return (
    <Box sx={{ pt: 2 }}>
      <DatasetModal
        open={installModalOpen}
        onClose={() => {
          setInstallModalOpen(false);
        }}
        visibleFields={{ description: true, tags: true }}
      />
      <Button
        data-testid="dataset-create-btn"
        variant="contained"
        fullWidth
        onClick={() => {
          resetAllFields();
          setInstallModalOpen(true);
        }}
      >
        + New dataset...
      </Button>
    </Box>
  );
}
