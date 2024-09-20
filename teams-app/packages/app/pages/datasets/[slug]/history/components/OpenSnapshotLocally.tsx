import { CodeTabs, Dialog } from '@fiftyone/teams-components';
import {
  openSnapshotLocallyState,
  useCurrentDataset
} from '@fiftyone/teams-state';
import { LEARN_MORE_ABOUT_DATASET_SNAPSHOT_LINK } from '@fiftyone/teams-state/src/constants';
import { Link, Stack, Typography } from '@mui/material';
import { useRouter } from 'next/router';
import { useRecoilState } from 'recoil';

export default function OpenSnapshotLocally() {
  const route = useRouter();
  const [state, setState] = useRecoilState(openSnapshotLocallyState);
  const datasetSlug = route.query.slug as string;
  const dataset = useCurrentDataset(datasetSlug);

  const { open, name } = state;
  const datasetName = dataset?.name;

  const code = `# Import FiftyOne
import fiftyone as fo

# Load this snapshot
dataset = fo.load_dataset("${datasetName}", snapshot="${name}")`;

  return (
    <Dialog
      open={open}
      onClose={() => setState((state) => ({ ...state, open: false }))}
      title="View snapshot locally"
      hideActionButtons
      maxWidth={false}
    >
      <Stack spacing={2} pb={2}>
        <Typography>
          You can load this snapshot on your local machine with the code below
        </Typography>
        <Typography>
          Learn more about{' '}
          <Link href={LEARN_MORE_ABOUT_DATASET_SNAPSHOT_LINK} target="_blank">
            snapshots in FiftyOne
          </Link>
        </Typography>
      </Stack>
      <CodeTabs tabs={[{ id: 'python', code, label: 'Python' }]} />
    </Dialog>
  );
}
