import { useCacheStore, useMutation } from '@fiftyone/hooks';
import { Dialog } from '@fiftyone/teams-components';
import {
  CLOUD_STORAGE_CREDENTIALS_CACHE_KEY,
  CONSTANT_VARIABLES,
  cloudStorageRemoveCredentialMutation,
  deleteCredentialAtom
} from '@fiftyone/teams-state';
import { pluralize } from '@fiftyone/teams-utilities';
import { Typography } from '@mui/material';
import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
const { CLOUD_STORAGE_PROVIDERS } = CONSTANT_VARIABLES;

export default function DeleteCredential() {
  const [state, setState] = useRecoilState(deleteCredentialAtom);
  const [removeCredential, loading] = useMutation(
    cloudStorageRemoveCredentialMutation
  );
  const [_, setStale] = useCacheStore(CLOUD_STORAGE_CREDENTIALS_CACHE_KEY);
  const handleClose = useCallback(() => {
    setState((state) => {
      return { ...state, open: false };
    });
  }, [setState]);

  const { open, provider, prefixes } = state;
  const { label } = CLOUD_STORAGE_PROVIDERS[provider];
  const prefixesCount = Array.isArray(prefixes) ? prefixes.length : 0;

  return (
    <Dialog
      title={`Delete ${label} credential?`}
      open={open}
      onClose={handleClose}
      onConfirm={() => {
        removeCredential({
          variables: { provider, prefixes },
          successMessage: `Successfully deleted a credential for ${label}`,
          errorMessage: `Failed to delete a credential ${label}`,
          onCompleted() {
            handleClose();
            setStale(true);
          }
        });
      }}
      confirmationButtonColor="error"
      loading={loading}
      disableConfirmationButton={loading}
    >
      <Typography sx={{ '& .MuiTypography-root': { display: 'inline' } }}>
        Are you sure you want to delete&nbsp;
        {prefixesCount > 0 ? (
          <Typography>
            credential for {pluralize(prefixesCount, 'bucket')}&nbsp;
            <Typography fontWeight={360}>
              {prefixes?.join(', ')}
            </Typography>{' '}
            in&nbsp;
          </Typography>
        ) : (
          <Typography>
            the&nbsp;
            <Typography fontWeight={360}>default credentials</Typography>
            &nbsp;for&nbsp;
          </Typography>
        )}
        <Typography fontWeight={360}>{label}</Typography>?
      </Typography>
    </Dialog>
  );
}
