import { ExportIcon, PopoverButton } from "@fiftyone/teams-components";
import { exportViewForceClosePopoverCount } from "@fiftyone/teams-state";
import { Typography } from "@mui/material";
import { useRecoilValue } from "recoil";
import ExportViewBody from "./ExportViewBody";
import { datasetPage } from "../../samples/dynamicRouting/usePage";

export default function ExportView() {
  const count = useRecoilValue(exportViewForceClosePopoverCount);
  // export panel can crash if embeddedApp dataset is still loading
  const datasetPageValue = useRecoilValue(datasetPage);
  if (!datasetPageValue) return null;

  return (
    <PopoverButton
      PopoverButtonBody={() => (
        <Typography color="text.primary" data-cy="export-button">
          Export
        </Typography>
      )}
      popoverButtonProps={{
        variant: undefined,
        sx: { mr: 2 },
        startIcon: <ExportIcon fontSize="inherit" sx={{ ml: 0.5 }} />,
      }}
      PopoverBody={ExportViewBody}
      forceCloseCount={count}
    />
  );
}
