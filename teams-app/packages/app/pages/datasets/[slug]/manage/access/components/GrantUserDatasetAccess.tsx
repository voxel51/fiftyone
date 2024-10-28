import {
  useCurrentUser,
  useCurrentUserPermission,
  useSecurityRole,
  useUserAudit,
  useUserRole,
  withSuspense,
} from "@fiftyone/hooks";
import NextLink from "next/link";
import useGrantUserDatasetAccess from "@fiftyone/hooks/src/dataset/access/useGrantUserDatasetAccess";
import { Dialog } from "@fiftyone/teams-components";
import {
  DatasetPermission,
  MANAGE_DATASET_ACCESS,
  MANAGE_ORGANIZATION,
  manageAccessItemsState,
  ManageDatasetAccessUser,
  manageDatasetGrantUserAccessOpenState,
} from "@fiftyone/teams-state";
import { Link } from "@mui/material";
import { UserRole } from "@fiftyone/teams-state/src/Dataset/__generated__/manageDatasetInviteUserToDatasetMutation.graphql";
import { Box, Stack, Typography } from "@mui/material";
import { capitalize } from "lodash";
import LicenseAudit from "pages/settings/team/users/components/LicenseAudit";
import { Suspense, useCallback, useState } from "react";
import { useRecoilState } from "recoil";
import GrantDatasetAccessTitle from "./GrantDatasetAccessTitle";
import ManageUser from "./ManageUser";
import UserInputSuggestion from "./UserInputSuggestion";
import {
  INVITE_HELPER_TEXT_DATASET_ACCESS,
  INVITE_HELPER_TEXT_DATASET_ACCESS_CAN_MANAGE_DATASET,
  TEAM_USERS_PATH,
} from "@fiftyone/teams-state/src/constants";

function GrantUserDatasetAccess() {
  const [open, setOpen] = useRecoilState(manageDatasetGrantUserAccessOpenState);
  const [user, setUser] = useState<any>();
  const { maxDatasetPermission } = useSecurityRole();
  const [userStatePermission, setUserStatePermission] =
    useState<DatasetPermission>("VIEW");
  const [unregisteredUserRole, setUnregisteredUserRole] =
    useState<UserRole | null>(null);
  const { grantUserDatasetAccess, isGrantingUserDatasetAccess } =
    useGrantUserDatasetAccess();
  const mutationInProgress = isGrantingUserDatasetAccess;

  const [currentUser] = useCurrentUser();
  const canManageOrg = useCurrentUserPermission([MANAGE_ORGANIZATION]);
  const canManageDatasetAccess = useCurrentUserPermission([
    MANAGE_DATASET_ACCESS,
  ]);
  const [showInvitationHelperText, setShowInvitationHelperText] =
    useState(false);

  const { hasSeatsLeft } = useUserAudit();
  const { canSendEmailInvitations } = useUserRole();

  const shouldDisableSubmit =
    userStatePermission &&
    user &&
    !user.id &&
    !hasSeatsLeft?.(unregisteredUserRole || "");

  const closeDialog = useCallback(() => {
    setOpen(false);
    setUser(null);
    setUserStatePermission("VIEW");
    setUnregisteredUserRole(null);
    setShowInvitationHelperText(false);
  }, [setOpen]);

  const [accessItems, setAccessItems] = useRecoilState(manageAccessItemsState);

  const onGrantAccessComplete = useCallback(
    (accessItem: ManageDatasetAccessUser) => {
      setAccessItems([accessItem, ...accessItems]);
      closeDialog();
    },
    [setAccessItems, accessItems, closeDialog]
  );

  const onGrantAccessByInviteComplete = useCallback(() => {
    // don't close the modal if false so user can see helper text
    if (!canSendEmailInvitations) {
      setShowInvitationHelperText(true);
    }
  }, [canSendEmailInvitations]);

  const showTextForCanManageOrg = showInvitationHelperText && canManageOrg;
  const showTextForCanManageDataset =
    showInvitationHelperText && !canManageOrg && canManageDatasetAccess;

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
        if (user) {
          grantUserDatasetAccess(
            user,
            userStatePermission,
            unregisteredUserRole,
            onGrantAccessComplete,
            onGrantAccessByInviteComplete
          );
        }
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
        {showTextForCanManageOrg && (
          <Typography variant="body1">
            <NextLink href={TEAM_USERS_PATH} passHref>
              <Link>Click here</Link>
            </NextLink>
            {` ${INVITE_HELPER_TEXT_DATASET_ACCESS}`}
          </Typography>
        )}
        {showTextForCanManageDataset && (
          <Typography variant="body1">
            {INVITE_HELPER_TEXT_DATASET_ACCESS_CAN_MANAGE_DATASET}
          </Typography>
        )}
      </Stack>

      {shouldDisableSubmit && (
        <Box
          sx={{
            display: "flex",
            flexDirection: "row-reverse",
            marginTop: "0.3rem",
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
