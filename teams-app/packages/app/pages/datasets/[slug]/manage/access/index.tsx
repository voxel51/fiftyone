import {
  useCurrentDatasetPermission,
  useCurrentOrganization,
  useCurrentUserPermission,
  withPermissions
} from '@fiftyone/hooks';
import { Box, SectionHeader, TableSkeleton } from '@fiftyone/teams-components';
import {
  INVITE_PEOPLE_TO_DATASET,
  MANAGE_DATASET_ACCESS,
  MANAGE_ORGANIZATION,
  SET_DATASET_DEFAULT_PERMISSION,
  manageDatasetGetAccessPageQuery,
  manageDatasetGrantGroupAccessOpenState,
  manageDatasetGrantUserAccessOpenState
} from '@fiftyone/teams-state';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  LEARN_MORE_ABOUT_ROLES_LINK
} from '@fiftyone/teams-state/src/constants';
import { GroupAdd, PersonAddAlt } from '@mui/icons-material';
import { Button, Link, Typography } from '@mui/material';
import withRelay from 'lib/withRelay';
import NextLink from 'next/link';
import { useSetRecoilState } from 'recoil';
import Layout from '../components/Layout';
import GrantUserDatasetAccess from './components/GrantUserDatasetAccess';
import ManageDefaultDatasetAccess from './components/ManageDefaultDatasetAccess';
import ManagePeopleDatasetAccess from './components/ManagePeopleDatasetAccess';
import GrantGroupDatasetAccess from './components/GrantGroupDatasetAccess';
import { Suspense } from 'react';

function Access() {
  const setManageDatasetGrantUserAccessOpenState = useSetRecoilState(
    manageDatasetGrantUserAccessOpenState
  );
  const setManageDatasetGrantGroupAccessOpenState = useSetRecoilState(
    manageDatasetGrantGroupAccessOpenState
  );
  const canSetDefaultPermission = useCurrentDatasetPermission([
    SET_DATASET_DEFAULT_PERMISSION
  ]);
  const canInvite = useCurrentDatasetPermission([INVITE_PEOPLE_TO_DATASET]);
  const canManageOrganization = useCurrentUserPermission([MANAGE_ORGANIZATION]);
  const currentOrganization = useCurrentOrganization();
  const organizationDisplayName = currentOrganization?.displayName;

  return (
    <Layout>
      <Box data-testid="manage-access">
        <SectionHeader
          title="Default access"
          content={
            <Typography variant="body1">
              {`Manage access for members at ${organizationDisplayName}. All admins will
                also have access; collaborators and guests will only have access if they're
                specifically invited to a dataset.`}
              <br />
              <Link href={LEARN_MORE_ABOUT_ROLES_LINK + '#default-access'}>
                Learn more about default access.
              </Link>
            </Typography>
          }
        />
        <Box paddingTop={2} paddingBottom={4}>
          <Suspense fallback={<TableSkeleton rows={1} />}>
            <ManageDefaultDatasetAccess readOnly={!canSetDefaultPermission} />
          </Suspense>
        </Box>
        <SectionHeader
          title="Specific access"
          content={
            <Typography variant="body1">
              These people and groups have specific access to this dataset.
              <br />
              <Link
                href={LEARN_MORE_ABOUT_ROLES_LINK + '#teams-specifc-access'}
              >
                Learn more about specific access.
              </Link>
              <br />
              {canManageOrganization ? (
                <>
                  <NextLink href="/settings/team/users" passHref>
                    <Link>Manage team settings</Link>
                  </NextLink>
                </>
              ) : (
                ''
              )}
              .
            </Typography>
          }
        >
          {canInvite ? (
            <>
              <Button
                data-testid="dataset-access-add-user-btn"
                startIcon={<PersonAddAlt />}
                onClick={() => {
                  setManageDatasetGrantUserAccessOpenState(true);
                }}
                variant="outlined"
              >
                Add User
              </Button>
              <Button
                startIcon={<GroupAdd />}
                onClick={() => {
                  setManageDatasetGrantGroupAccessOpenState(true);
                }}
                sx={{ marginLeft: 1 }}
                variant="outlined"
              >
                Add Group
              </Button>
            </>
          ) : undefined}
        </SectionHeader>
        <GrantUserDatasetAccess />
        <GrantGroupDatasetAccess />
        <Box paddingTop={2} paddingBottom={4}>
          <ManagePeopleDatasetAccess />
        </Box>
      </Box>
    </Layout>
  );
}

export default withRelay(
  withPermissions(Access, [MANAGE_DATASET_ACCESS], 'dataset'),
  manageDatasetGetAccessPageQuery,
  { getLayoutProps: () => ({ topNavProps: { noBorder: true } }) },
  { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE }
);
