import { useDeleteGroup } from '@fiftyone/hooks';
import { Dialog, TextInput } from '@fiftyone/teams-components';
import { removeGroupState } from '@fiftyone/teams-state';
import { Typography } from '@mui/material';
import { FC, useCallback, useState } from 'react';
import { useRecoilState } from 'recoil';
import Router from 'next/router';

const DeleteGroupModal: FC = () => {
  const [groupToBeDelete, setGroupToBeDelete] =
    useRecoilState(removeGroupState);
  const [input, setInput] = useState('');
  const open = !!groupToBeDelete;
  const [error, setError] = useState('');

  const handleClose = useCallback(() => {
    setGroupToBeDelete(null);
  }, [setGroupToBeDelete]);

  const { name, id } = groupToBeDelete || {};
  const { deleteGroup, isDeletingGroup } = useDeleteGroup();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      onConfirm={() => {
        deleteGroup(
          id,
          `Successfully delete group ${name}`,
          `Failed to delete group ${name}`,
          () => {
            Router.push(`/settings/team/groups`);
            handleClose();
          },
          (error) => {
            console.error('Failed to delete group', error);
            setError('Failed to delete group');
          }
        );
      }}
      title={`Delete group ${name}?`}
      confirmationButtonColor="error"
      confirmationButtonText="Delete group"
      disableConfirmationButton={input !== name}
      loading={isDeletingGroup}
    >
      <Typography fontWeight={360} noWrap>
        Are you sure you want to permanently delete this group? This cannot be
        undone.
      </Typography>
      <TextInput
        fieldLabel="Type group name"
        size="small"
        fullWidth
        containerProps={{ pt: 4 }}
        placeholder={name}
        onChange={(e) => setInput(e.target.value)}
        error={!!error}
      />
      {error && (
        <Typography
          variant="subtitle2"
          color="error"
          sx={{
            transition: 'height 0.3s ease-in',
            overflow: 'hidden',
            paddingBottom: '1rem'
          }}
        >
          {error}
        </Typography>
      )}
    </Dialog>
  );
};

export default DeleteGroupModal;
