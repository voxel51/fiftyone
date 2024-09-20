import { useCurrentDataset } from '@fiftyone/hooks';
import { Box, CodeTabs } from '@fiftyone/teams-components';
import { CODE_EXPORT_LINK } from '@fiftyone/teams-state/src/constants';
import { Typography, Link } from '@mui/material';

export default function CodeExport() {
  const dataset = useCurrentDataset();
  const name = dataset?.name;

  const ExportCode = `import fiftyone as fo

dataset = fo.load_dataset("${name}")

export_dir = "/path/for/export"

label_field = "ground_truth"

# Any subclass of \`fiftyone.types.Dataset\` is supported
dataset_type = fo.types.COCODetectionDataset

dataset.export(
    export_dir=export_dir,
    dataset_type=dataset_type,
    label_field=label_field,
)`;

  return (
    <Box sx={{ mt: 2 }}>
      <Typography sx={{ mb: 0 }}>
        You can use Python to download this dataset directly to your local
        machine. <Link href={CODE_EXPORT_LINK}>Learn more</Link> about using
        code to download datasets.
      </Typography>
      <CodeTabs tabs={[{ id: 'python', code: ExportCode, label: 'Python' }]} />
    </Box>
  );
}
