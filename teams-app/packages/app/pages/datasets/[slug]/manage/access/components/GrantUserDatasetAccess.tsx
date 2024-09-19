import {
  useCurrentUser,
  useSecurityRole,
  useUserAudit,
  withSuspense
} from '@fiftyone/hooks';
import useGrantUserDatasetAccess from '@fiftyone/hooks/src/dataset/access/useGrantUserDatasetAccess';
import { Dialog } from '@fiftyone/teams-components';
import {
  DatasetPermission,
  manageDatasetGrantUserAccessOpenState
} from '@fiftyone/teams-state';
import { UserRole } from '@fiftyone/teams-state/src/Dataset/__generated__/manageDatasetInviteUserToDatasetMutation.graphql';
import { Box, Stack, Typography } from '@mui/material';
import { capitalize } from 'lodash';
import LicenseAudit from 'pages/settings/team/users/components/LicenseAudit';
import { Suspense, useState } from 'react';
import { useRecoilState } from 'recoil';
import GrantDatasetAccessTitle from './GrantDatasetAccessTitle';
import ManageUser from './ManageUser';
import UserInputSuggestion from './UserInputSuggestion';

function GrantUserDatasetAccess() {
  const [open, setOpen] = useRecoilState(manageDatasetGrantUserAccessOpenState);
  const [user, setUser] = useState<any>();
  const { maxDatasetPermission } = useSecurityRole();
  const [userStatePermission, setUserStatePermission] =
    useState<DatasetPermission>('VIEW');
  const [unregisteredUserRole, setUnregisteredUserRole] =
    useState<UserRole | null>(null);
  const { grantUserDatasetAccess, isGrantingUserDatasetAccess } =
    useGrantUserDatasetAccess();
  const mutationInProgress = isGrantingUserDatasetAccess;
  const [currentUser] = useCurrentUser();

  const { hasSeatsLeft } = useUserAudit();

  const shouldDisableSubmit =
    userStatePermission &&
    user &&
    !user.id &&
    !hasSeatsLeft?.(unregisteredUserRole || '');

  function closeDialog() {
    setOpen(false);
    setUser(null);
    setUserStatePermission('VIEW');
    setUnregisteredUserRole(null);
  }

  return (
    <Dialog
      data-testid="dataset-access-dialog"
      open={open}
      onClose={closeDialog}
      title={<GrantDatasetAccessTitle isGroup={false} />}
      fullWidth
      disableConfirmationButton={
        !user || mutationInProgress || shouldDisableSubmit
      }
      confirmationButtonText="Grant access"
      loading={mutationInProgress}
      onConfirm={() => {
        user &&
          grantUserDatasetAccess(
            user,
            userStatePermission,
            unregisteredUserRole,
            closeDialog
          );
      }}
    >
      <Stack spacing={2}>
        <LicenseAudit />
        <Suspense>
          <UserInputSuggestion user={user} onSelectUser={setUser} />
        </Suspense>
        {user && (
          <ManageUser
            maxDatasetPermission={maxDatasetPermission(
              user.id ? user?.role : currentUser.role
            )}
            target={user}
            permission={userStatePermission}
            hideRole
            userCardProps={{ email: capitalize(user.role) }}
            onDelete={() => {
              setUser(null);
            }}
            onPermissionChange={(permission: DatasetPermission) => {
              setUserStatePermission(permission);
            }}
            onRoleSelectionChange={(role: string) => {
              setUnregisteredUserRole(role as unknown as UserRole);
            }}
          />
        )}
      </Stack>
      {shouldDisableSubmit && (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'row-reverse',
            marginTop: '0.3rem'
          }}
        >
          <Typography variant="subtitle1" color="error">
            No seat left for this permission {userStatePermission}
          </Typography>
        </Box>
      )}
    </Dialog>
  );
}

export default withSuspense(GrantUserDatasetAccess, () => null);
