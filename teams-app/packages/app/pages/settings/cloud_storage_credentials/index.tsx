import {
  addCredentialAtom,
  mainTitleSelector,
  MANAGE_ORGANIZATION
} from '@fiftyone/teams-state';
import { SectionHeader, SettingsLayout } from '@fiftyone/teams-components';
import { withPermissions } from '@fiftyone/hooks';
import { useEffect } from 'react';
import { useSetRecoilState } from 'recoil';
import CloudStorageTable from './components/CloudStorageTable';
import ConnectCloudStorage from './components/AddCredential';
import DisconnectCloudStorage from './components/DeleteCredential';
import ManageCredentials from './components/ManageCredentials';
import { Button } from '@mui/material';
import { Add } from '@mui/icons-material';

function CloudStorageCredentials() {
  const setPageTitle = useSetRecoilState(mainTitleSelector);
  const setConnectCloudStorageState = useSetRecoilState(
    addCredentialAtom
  );
  useEffect(() => {
    setPageTitle('Settings');
  }, [setPageTitle]);

  return (
    <SettingsLayout>
      <SectionHeader
        title="Cloud storage credentials"
        description={
          'These credentials are used across your organization when viewing ' +
          'and uploading media in the browser. Python client users must' +
          ' provide their own credentials.'
        }
      >
        <Button
          variant="contained"
          startIcon={<Add />}
          onClick={() =>
            setConnectCloudStorageState((state) => ({ ...state, open: true }))
          }
        >
          Add credential
        </Button>
      </SectionHeader>
      <CloudStorageTable />
      <ConnectCloudStorage />
      <DisconnectCloudStorage />
      <ManageCredentials />
    </SettingsLayout>
  );
}

export { getServerSideProps } from 'lib/env';

export default withPermissions(
  CloudStorageCredentials,
  [MANAGE_ORGANIZATION],
  'user'
);
