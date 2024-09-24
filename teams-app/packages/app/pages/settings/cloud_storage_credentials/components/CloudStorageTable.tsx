import { useLazyLoadLatestQuery, withSuspense } from '@fiftyone/hooks';
import {
  BasicTable,
  Box,
  EmptyState,
  TableSkeleton
} from '@fiftyone/teams-components';
import {
  CLOUD_STORAGE_CREDENTIALS_CACHE_KEY,
  CONSTANT_VARIABLES,
  cloudStorageCredentialsQuery,
  cloudStorageCredentialsQueryT,
  manageCloudStorageAtom
} from '@fiftyone/teams-state';
import { pluralize } from '@fiftyone/teams-utilities';
import { Button } from '@mui/material';
import { useEffect, useMemo } from 'react';
import { useSetRecoilState } from 'recoil';
import ProviderIcon from './ProviderIcon';

const { CLOUD_STORAGE_PROVIDERS } = CONSTANT_VARIABLES;

function CloudStorageTable() {
  const cloudStorageCredentials =
    useLazyLoadLatestQuery<cloudStorageCredentialsQueryT>(
      cloudStorageCredentialsQuery,
      {},
      { cacheKey: CLOUD_STORAGE_CREDENTIALS_CACHE_KEY }
    );
  const setManageCloudStorageState = useSetRecoilState(manageCloudStorageAtom);
  const credentialsByProvider = useMemo(() => {
    const credentialsArray = cloudStorageCredentials?.cloudCredentials || [];
    const credentials: any = {};
    for (const credential of credentialsArray) {
      const { provider } = credential;
      if (!Object.hasOwn(credentials, provider)) {
        credentials[provider] = [];
      }
      credentials[provider].push(credential);
    }
    return credentials;
  }, [cloudStorageCredentials?.cloudCredentials]);
  const filteredProviders = useMemo(() => {
    return Object.values(CLOUD_STORAGE_PROVIDERS).filter(({ id }) => {
      return Object.hasOwn(credentialsByProvider, id);
    });
  }, [credentialsByProvider]);

  useEffect(() => {
    setManageCloudStorageState((state) => {
      const { provider, open } = state;
      if (!open) return state;
      const credentials = credentialsByProvider[provider] || [];
      return { ...state, open: credentials.length, credentials };
    });
  }, [credentialsByProvider, setManageCloudStorageState]);

  if (filteredProviders.length === 0) {
    return <EmptyState resource="cloud credentials" />;
  }

  const rows = filteredProviders.map(({ label, id }) => {
    const credentials = credentialsByProvider[id];
    const count = credentials.length;
    return {
      id,
      cells: [
        {
          id: 'icon',
          Component: <ProviderIcon provider={id} />,
          sx: { verticalAlign: 'middle', width: 24, pr: 0 }
        },
        { id: 'label', value: label },
        {
          id: 'manage-credentials',
          Component: (
            <Box sx={{ textAlign: 'right' }}>
              <Button
                onClick={() => {
                  setManageCloudStorageState({
                    open: true,
                    provider: id,
                    credentials
                  });
                }}
              >
                {count} {pluralize(count, 'Credential')}
              </Button>
            </Box>
          )
        }
      ]
    };
  });

  return <BasicTable rows={rows} />;
}

export default withSuspense(CloudStorageTable, TableSkeleton);
