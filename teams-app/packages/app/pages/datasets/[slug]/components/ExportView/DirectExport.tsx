import { useExportView } from '@fiftyone/hooks';
import { Box } from '@fiftyone/teams-components';
import ExportButton from './DirectExportButton';
import ExportForm from './ExportForm';

export default function DirectExport() {
  const { format, data, selectionIsValid, hasLabels } = useExportView();
  return (
    <Box sx={{ mt: 2 }}>
      <ExportForm />
      <ExportButton />
    </Box>
  );
}
