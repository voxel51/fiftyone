import {
  DatasetPermission,
  ManageDatasetAccessUser,
  manageDatasetInviteUserToDatasetMutation,
  manageDatasetSetDatasetUserPermissionMutation,
  User,
} from "@fiftyone/teams-state";
import { useCallback } from "react";
import { useRouter } from "next/router";
import { manageDatasetInviteUserToDatasetMutation$variables } from "@fiftyone/teams-state/src/Dataset/__generated__/manageDatasetInviteUserToDatasetMutation.graphql";
import { useMutation } from "../../common";
import { UserRole } from "../../user/__generated__/CurrentUserFragment.graphql";

/**
 * useGrantUserDatasetAccess should be used to set a user's access/permission
 * to a dataset.
 * @returns grantUserDatasetAccess: a method to set user's dataset access
 * isGrantingUserDatasetAccess: indicates whether a mutation is in progress or not
 */
export default function useGrantUserDatasetAccess() {
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const [grantUserDatasetAccessMutation, isGrantingAccess] = useMutation(
    manageDatasetSetDatasetUserPermissionMutation
  );
  // TODO: move this to its own hook and use the hook here as a dep.
  const [inviteUser, isInvitingUser] = useMutation(
    manageDatasetInviteUserToDatasetMutation
  );

  const grantUserDatasetAccess = useCallback(
    (
      user: User | null,
      permission: DatasetPermission,
      role: UserRole | null,
      onComplete: (accessItem: ManageDatasetAccessUser) => void,
      onGrantAccessByInviteComplete: () => void
    ) => {
      if (!user || !datasetIdentifier) return;

      const { id, email } = user;
      const variables: manageDatasetInviteUserToDatasetMutation$variables = {
        datasetIdentifier: datasetIdentifier as string,
        permission,
        email,
        role,
        ...(id ? { userId: id } : { email }),
      };
      const setDatasetPermission = id
        ? grantUserDatasetAccessMutation
        : inviteUser;
      setDatasetPermission({
        successMessage: id
          ? "Successfully granted special access on the dataset to user"
          : "Successfully invited user with a special access to the dataset",
        variables,
        onCompleted(result) {
          if (id) {
            const { setDatasetUserPermission = {} } = result;
            const { user: baseUser = {} } = setDatasetUserPermission;
            const { user = {}, userPermission, activePermission } = baseUser;
            const { id: userId } = user;

            onComplete &&
              onComplete({
                ...user,
                userId,
                userPermission,
                activePermission,
              });
          } else {
            // granting access with an invite
            onGrantAccessByInviteComplete && onGrantAccessByInviteComplete();
          }
        },
      });
    },
    [datasetIdentifier]
  );

  return {
    grantUserDatasetAccess,
    isGrantingUserDatasetAccess: isInvitingUser || isGrantingAccess,
  };
}
