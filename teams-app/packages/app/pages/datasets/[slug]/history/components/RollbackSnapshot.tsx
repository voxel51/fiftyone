import { useMutation } from '@fiftyone/hooks';
import { Dialog, TextInput, Timestamp } from '@fiftyone/teams-components';
import {
  historyRevertDatasetToSnapshotMutation,
  pendingDatasetRefresh,
  rollbackSnapshotState,
  useCurrentDataset
} from '@fiftyone/teams-state';
import { longDate } from '@fiftyone/teams-utilities';
import { Stack, Typography } from '@mui/material';
import { useRouter } from 'next/router';
import { useCallback, useState } from 'react';
import { useRecoilState, useSetRecoilState } from 'recoil';

export default function RollbackSnapshot(props: RollbackSnapshotPropsType) {
  const { refresh, onRollback } = props;
  const route = useRouter();
  const dataset = useCurrentDataset(route.query.slug as string);
  const [state, setState] = useRecoilState(rollbackSnapshotState);
  const setPending = useSetRecoilState(pendingDatasetRefresh);
  const [inputState, setInputState] = useState('');
  const [rollback, rollingBack] = useMutation(
    historyRevertDatasetToSnapshotMutation
  );
  const handleClose = useCallback(() => {
    setState((state) => ({ ...state, open: false }));
  }, [setState]);

  const datasetName = dataset?.name;
  const { open, name, author, since } = state;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Rollback to previous snapshot?"
      confirmationButtonText="Rollback dataset"
      confirmationButtonColor="error"
      disableConfirmationButton={rollingBack || inputState !== name}
      onConfirm={() => {
        rollback({
          variables: { datasetIdentifier: datasetName, snapshotName: name },
          successMessage: `Successfully rolled back dataset to snapshot ${name}`,
          onSuccess: () => {
            handleClose();
            if (refresh) refresh();
            if (onRollback) onRollback();
            setPending(true); // force dataset to refresh
          }
        });
      }}
      loading={rollingBack}
    >
      <Stack spacing={2}>
        <Typography>
          Are you sure you want to revert this dataset to a previous snapshot?
        </Typography>
        <Typography>
          This will permanently reset all samples and dataset metadata to the
          snapshot &ldquo;
          <Typography fontWeight={360} component={'span'}>
            {name}
          </Typography>
          &rdquo; saved by{' '}
          <Typography fontWeight={360} component={'span'}>
            {author}
          </Typography>
          .
        </Typography>
        <Typography fontWeight={360}>
          All changes to the dataset since{' '}
          <Timestamp
            timestamp={since as number}
            format="long"
            fontWeight={360}
          />{' '}
          will be lost.
        </Typography>
      </Stack>
      <TextInput
        fieldLabel="Type snapshot name"
        size="small"
        fullWidth
        placeholder={name}
        containerProps={{ pt: 2 }}
        onChange={(e) => setInputState(e.target.value)}
      />
    </Dialog>
  );
}

type RollbackSnapshotPropsType = {
  refresh?: () => void;
  onRollback?: () => void;
};
