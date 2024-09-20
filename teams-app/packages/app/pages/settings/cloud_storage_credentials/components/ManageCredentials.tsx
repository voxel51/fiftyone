import { BasicTable, Box, Dialog, Timestamp } from '@fiftyone/teams-components';
import {
  CONSTANT_VARIABLES,
  deleteCredentialAtom,
  manageCloudStorageAtom
} from '@fiftyone/teams-state';
import { Button, Stack, Typography } from '@mui/material';
import { useRecoilState, useSetRecoilState } from 'recoil';

const { CLOUD_STORAGE_PROVIDERS } = CONSTANT_VARIABLES;

export default function ManageCredentials() {
  const [state, setState] = useRecoilState(manageCloudStorageAtom);
  const setDisconnectState = useSetRecoilState(deleteCredentialAtom);
  const { open, provider, credentials } = state;

  return (
    <Dialog
      title={
        <Stack sx={{ pb: 2 }}>
          <Typography variant="h6">
            Cloud storage credentials for&nbsp;
            {CLOUD_STORAGE_PROVIDERS[provider]?.label}
          </Typography>
        </Stack>
      }
      open={open}
      onClose={() => setState((state) => ({ ...state, open: false }))}
      fullWidth
      hideActionButtons
      maxWidth="md"
    >
      <BasicTable
        excludeContainer
        rows={[
          {
            id: provider + '-credentials-heading',
            cells: [
              {
                id: 'prefixes',
                Component: <Typography variant="body2">Buckets</Typography>
              },
              {
                id: 'description',
                Component: <Typography variant="body2">Description</Typography>
              },
              {
                id: 'created',
                Component: <Typography variant="body2">Created</Typography>
              },
              {
                id: 'delete',
                value: ''
              }
            ]
          },
          ...credentials.map(({ description, prefixes, createdAt }, i) => {
            return {
              id: provider + '-credential-' + i,
              cells: [
                {
                  id: 'prefixes',
                  value: prefixes.join(', ')
                },
                {
                  id: 'description',
                  value: description || ''
                },
                {
                  id: 'created',
                  Component: <Timestamp timestamp={createdAt} />
                },
                {
                  id: 'delete',
                  Component: (
                    <Box textAlign="right">
                      <Button
                        onClick={() =>
                          setDisconnectState({ open: true, provider, prefixes })
                        }
                        color="error"
                      >
                        Delete
                      </Button>
                    </Box>
                  )
                }
              ]
            };
          })
        ]}
      />
    </Dialog>
  );
}
