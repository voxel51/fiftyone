import { useCacheStore, useMutation } from '@fiftyone/hooks';
import { BasicFormState, Box, Button } from '@fiftyone/teams-components';
import {
  CLOUD_STORAGE_CREDENTIALS_CACHE_KEY,
  addCredentialAtom,
  cloudStorageSetCredentialMutation
} from '@fiftyone/teams-state';
import { CLOUD_STORAGE_PROVIDERS } from '@fiftyone/teams-state/src/constants';
import { Close } from '@mui/icons-material';
import { Dialog, IconButton, Stack, Typography } from '@mui/material';
import { useCallback, useState } from 'react';
import { useRecoilState } from 'recoil';
import { contentByProvider, readTextFile } from '../utils';
import ProviderIcon from './ProviderIcon';

export default function AddCredential() {
  const [state, setState] = useRecoilState(addCredentialAtom);
  const [formState, setFormState] = useState<BasicFormState>({});
  const [setCloudStorageCredential, loading] = useMutation(
    cloudStorageSetCredentialMutation
  );
  const [_, setStale] = useCacheStore(CLOUD_STORAGE_CREDENTIALS_CACHE_KEY);
  const handleClose = useCallback(() => {
    setState((state) => ({ ...state, open: false }));
  }, [setState]);

  const { open, provider } = state;
  const { Component, title } = contentByProvider[provider];
  const { label } = CLOUD_STORAGE_PROVIDERS[provider];

  return (
    <Dialog open={open} onClose={handleClose}>
      <Stack direction="row">
        <Stack
          sx={{
            justifyContent: 'center',
            background: (theme) => theme.palette.background.secondary
          }}
        >
          {Object.values(CLOUD_STORAGE_PROVIDERS).map(({ id, label }) => {
            const bg = id === provider ? 'primary' : 'secondary';
            return (
              <Box
                key={'connect-' + id}
                title={label}
                role="button"
                onClick={() => {
                  setFormState({});
                  setState((state) => ({ ...state, provider: id }));
                }}
                sx={{
                  cursor: 'pointer',
                  px: 2,
                  py: 4,
                  background: (theme) => theme.palette.background[bg],
                  '&:hover': {
                    background: (theme) => theme.palette.background.primary
                  }
                }}
              >
                <ProviderIcon provider={id} />
              </Box>
            );
          })}
        </Stack>
        <Box p={4}>
          <Typography sx={{ pb: 2 }} variant="h6">
            {title}
          </Typography>
          <IconButton
            aria-label="close"
            onClick={handleClose}
            sx={{ position: 'absolute', right: 32, top: 32 }}
          >
            <Close />
          </IconButton>
          <Component
            onChange={(formState) => {
              setFormState(formState);
            }}
          />
          <Stack
            direction="row"
            justifyContent="flex-end"
            spacing={2}
            sx={{ pt: 2 }}
          >
            <Button variant="outlined" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={loading || !formState?.isValid}
              loading={loading}
              onClick={async () => {
                const payload: any = {};
                let prefixes, description;
                for (const field of formState.fields) {
                  const { id, value } = field;
                  if (id === 'prefixes') {
                    if (value?.trim?.()?.length > 0) {
                      prefixes = value.split(',');
                    }
                  } else if (id === 'description') {
                    description = value;
                  } else if (Array.isArray(value) && value[0] instanceof File) {
                    payload[id] = await readTextFile(value[0]);
                  } else {
                    payload[id] = value;
                  }
                }
                const credentials = JSON.stringify(payload);
                setCloudStorageCredential({
                  successMessage: `Successfully added a credential for ${label}`,
                  errorMessage: `Failed to add a credential for ${label}`,
                  variables: { provider, credentials, prefixes, description },
                  onCompleted() {
                    setStale(true);
                    handleClose();
                  }
                });
              }}
            >
              Save credential
            </Button>
          </Stack>
        </Box>
      </Stack>
    </Dialog>
  );
}
