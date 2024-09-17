import { Button, CircularProgress, Typography } from '@mui/material';
import { Box, Dialog, TextInput } from '@fiftyone/teams-components';
import { useRecoilState } from 'recoil';
import { useCallback, useState } from 'react';
import { useMutation } from '@fiftyone/hooks';
import {
  secretsCreateMutation,
  showCreateSecretDialog
} from '@fiftyone/teams-state/src/Settings/secrets';

type CreateSecretProps = {
  onCreated?: Function;
};

export default function CreateSecret(props: CreateSecretProps) {
  const [open, setOpen] = useRecoilState(showCreateSecretDialog);
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');
  const [createSecret, creatingSecret] = useMutation(secretsCreateMutation);
  const { onCreated } = props;
  const [secretDescription, setSecretDescription] = useState('');

  const handleClose = useCallback(() => {
    setOpen(false);
    setSecretKey('');
    setSecretValue('');
  }, [setOpen, setSecretKey, setSecretValue]);


  function isValidKeyInput(str: string) {
    return /^[A-Za-z0-9- _.]+$/.test(str);
  }

  function toSnakeCase(str: string) {
    return str && str.replace(/([- .])/g, '_');
  }

  return (
    <Dialog
      title="Create new secret"
      open={open}
      onClose={handleClose}
      confirmationButtonText="Save"
      disableConfirmationButton={!secretKey || !secretValue || creatingSecret}
      loading={creatingSecret}
      onConfirm={() => {
        createSecret({
          successMessage: `Successfully created secret "${secretKey}"`,
          errorMessage: `Failed to create secret "${secretKey}"`,
          variables: {
            key: secretKey,
            value: secretValue,
            description: secretDescription
          },
          onCompleted(data) {
            if (onCreated) onCreated(data);
            handleClose();
          },
          onError(error) {
            console.error(error);
          }
        });
      }}
    >
      <Box>
        <Box>
          <TextInput
            fieldLabel="Key"
            placeholder="MY_SECRET_KEY"
            autoComplete="off"
            fullWidth
            style={{ textTransform: 'uppercase' }}
            disabled={creatingSecret}
            onKeyDown={(e) => {
              if (!isValidKeyInput(e.key)) {
                e.preventDefault();
              }
            }}
            onChange={(e) => {
              setSecretKey(toSnakeCase(e.target.value.toUpperCase()));
            }}
            value={secretKey}
          />
          <Typography variant="caption">
            Use only uppercase letters, numbers, and underscores
          </Typography>
        </Box>
        <Box paddingTop={3}>
          <TextInput
            fieldLabel="Value"
            placeholder="plaintext value"
            type="password"
            fullWidth
            disabled={creatingSecret}
            onChange={(e) => {
              setSecretValue(e.target.value);
            }}
          />
          <Typography variant="caption">
            The value will be encrypted in the database
          </Typography>
        </Box>
        <Box paddingTop={3}>
          <TextInput
            fieldLabel="Description"
            placeholder="Add a description to help you remember what this secret is for."
            multiline
            fullWidth
            autoComplete="off"
            disabled={creatingSecret}
            onChange={(e) => {
              setSecretDescription(e.target.value);
            }}
          />
        </Box>

      </Box>
    </Dialog>
  );
}
