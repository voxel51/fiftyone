import {
  useExportVariables,
  useExportView,
  useMutation
} from '@fiftyone/hooks';
import { Button } from '@fiftyone/teams-components';
import {
  CONSTANT_VARIABLES,
  DatasetExportMutation,
  exportViewForceClosePopoverCount
} from '@fiftyone/teams-state';
import CloudOutlinedIcon from '@mui/icons-material/CloudOutlined';
import { useMemo } from 'react';
import { useRecoilState } from 'recoil';
const { EXPORT_DATA_ITEMS } = CONSTANT_VARIABLES;

export default function CloudExportButton() {
  const { canCloudExport, data, reset, selectionIsValid } = useExportView();
  const variables = useExportVariables();
  const [exportView, loading] = useMutation(DatasetExportMutation);
  const [count, setCount] = useRecoilState(exportViewForceClosePopoverCount);

  const dataTitle = useMemo(
    () => data && EXPORT_DATA_ITEMS[data].title.toLowerCase(),
    [data]
  );
  return (
    <Button
      startIcon={<CloudOutlinedIcon />}
      variant="contained"
      onClick={() => {
        exportView({
          successMessage: `Successfully exported ${dataTitle} to the cloud storage path`,
          errorMessage: `Failed to export ${dataTitle} to the cloud storage path`,
          variables,
          onSuccess: () => {
            reset();
            // force close popover
            setCount(count + 1);
          }
        });
      }}
      disabled={!canCloudExport || !selectionIsValid || loading}
      loading={loading}
      sx={{ mt: 2 }}
    >
      Begin export
    </Button>
  );
}
