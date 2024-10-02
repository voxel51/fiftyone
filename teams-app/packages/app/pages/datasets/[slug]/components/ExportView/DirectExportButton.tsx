import {
  useExportVariables,
  useExportView,
  useMutation,
  useURLInfo,
} from "@fiftyone/hooks";
import { Box, Button } from "@fiftyone/teams-components";
import {
  CONSTANT_VARIABLES,
  DatasetExportMutation,
  exportViewForceClosePopoverCount,
} from "@fiftyone/teams-state";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Link } from "@mui/material";
import { useMemo, useRef } from "react";
import { useRecoilState } from "recoil";
const { EXPORTED_FILE_BASE_PATH, EXPORT_DATA_ITEMS } = CONSTANT_VARIABLES;

export default function DirectExportButton() {
  const { host } = useURLInfo();
  const { canExport, data, reset, selectionIsValid } = useExportView();
  const variables = useExportVariables();
  const downloadLink = useRef(null);
  const [exportView, loading] = useMutation(DatasetExportMutation);
  const [count, setCount] = useRecoilState(exportViewForceClosePopoverCount);

  const dataTitle = useMemo(
    () => data && EXPORT_DATA_ITEMS[data].title.toLowerCase(),
    [data]
  );
  return (
    <Box sx={{ mt: 2 }}>
      <Link href="" download ref={downloadLink} hidden />
      <Button
        startIcon={<FileDownloadOutlinedIcon />}
        variant="contained"
        onClick={() => {
          exportView({
            successMessage: `Successfully exported ${dataTitle}`,
            errorMessage: `Failed to export ${dataTitle}`,
            variables,
            onSuccess: (result) => {
              const { exportView } = result || {};
              if (exportView) {
                const downloadLinkElem = downloadLink.current as HTMLElement;
                const exportURL = host + EXPORTED_FILE_BASE_PATH + exportView;
                downloadLinkElem.setAttribute("href", exportURL);
                downloadLinkElem.click();
              }
              reset();
              // force close popover
              setCount(count + 1);
            },
          });
        }}
        disabled={!canExport || !selectionIsValid || loading}
        loading={loading}
      >
        Download
      </Button>
    </Box>
  );
}
