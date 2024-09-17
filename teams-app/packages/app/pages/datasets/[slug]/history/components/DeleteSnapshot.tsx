import { useCurrentDataset, useMutation } from '@fiftyone/hooks';
import { Dialog, TextInput } from '@fiftyone/teams-components';
import {
  deleteSnapshotState,
  historyDeleteSnapshotMutation
} from '@fiftyone/teams-state';
import { Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { useRecoilState } from 'recoil';

export default function DeleteSnapshot(props) {
  const { refresh, onDelete } = props;
  const [state, setState] = useRecoilState(deleteSnapshotState);
  const dataset = useCurrentDataset();
  const [inputState, setInputState] = useState('');
  const [deleteSnapshot, deletingSnapshot] = useMutation(
    historyDeleteSnapshotMutation
  );
  const handleClose = useCallback(() => {
    setState((state) => ({ ...state, open: false }));
  }, []);

  const datasetName = dataset?.name;
  const { open, name } = state;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onConfirm={() => {
        deleteSnapshot({
          variables: { datasetIdentifier: datasetName, snapshotName: name },
          successMessage: `Successfully deleted snapshot "${name}"`,
          onSuccess: () => {
            handleClose();
            if (typeof refresh === 'function') refresh();
            if (typeof onDelete === 'function') onDelete();
          }
        });
      }}
      title="Delete dataset snapshot?"
      confirmationButtonColor="error"
      confirmationButtonText="Delete snapshot"
      disableConfirmationButton={inputState !== name}
      loading={deletingSnapshot}
    >
      <Typography>
        Are you sure you want to delete the saved snapshot &ldquo;
        <Typography component="span" fontWeight={360}>
          {name}
        </Typography>
        &rdquo;? This cannot be undone.
      </Typography>
      <TextInput
        fieldLabel="Type snapshot name"
        size="small"
        fullWidth
        containerProps={{ pt: 4 }}
        placeholder={name}
        onChange={(e) => setInputState(e.target.value)}
      />
    </Dialog>
  );
}
