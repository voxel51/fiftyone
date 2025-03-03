import { Box, Paper, Stack, Typography } from "@mui/material";
import {
  getFileName,
  getFileSize,
  getIcon,
} from "@fiftyone/looker/src/elements/metadata/util";
import { ModalSample, Sample } from "@fiftyone/state";
import { JSONViewer } from "@fiftyone/components";
import { formatLongDateTime, getMimeType } from "@fiftyone/utilities";

const LabeledMetadata = ({
  label,
  value,
}: {
  label: string;
  value: string;
}) => {
  return (
    <Stack direction="row" spacing={1}>
      <Typography color="secondary">{label}:</Typography>
      <Typography>{value}</Typography>
    </Stack>
  );
};

const SampleMetadata = ({ sample }: { sample: Sample }) => {
  return (
    <Box>
      <Stack direction="column" spacing={4}>
        <Stack direction="row" spacing={2} alignItems="center">
          <img alt="icon" src={getIcon(sample.filepath)} />
          <Typography variant="h5">{getFileName(sample.filepath)}</Typography>
        </Stack>

        <Stack direction="row" spacing={8}>
          <LabeledMetadata label="Size" value={getFileSize(sample)} />
          <LabeledMetadata label="Type" value={getMimeType(sample)} />
          <LabeledMetadata
            label="Created"
            value={formatLongDateTime(sample.created_at?.datetime)}
          />
        </Stack>
      </Stack>
    </Box>
  );
};

export const MetadataLooker = ({ sample }: { sample: ModalSample }) => {
  return (
    <Box sx={{ width: "100%", height: "100%", p: 2, pr: 0 }}>
      <Stack direction="column" spacing={2}>
        <Paper sx={{ p: 2 }}>
          <SampleMetadata sample={sample.sample} />
        </Paper>
        <Paper sx={{ p: 2 }}>
          <JSONViewer value={sample.sample} />
        </Paper>
      </Stack>
    </Box>
  );
};
