import { useCacheStore, useMutation } from "@fiftyone/hooks";
import {
  DATASET_SHARE_MODAL_INFO_CACHE_KEY,
  DatasetPermission,
  Group,
  ManageDatasetAccessGroup,
  manageDatasetSetDatasetGroupPermissionMutation,
  manageDatasetSetDatasetGroupPermissionMutation$dataT,
  manageDatasetSetDatasetGroupPermissionMutationT,
} from "@fiftyone/teams-state";
import { useRouter } from "next/router";
import { useCallback } from "react";

function useGrantGroupDatasetAccess() {
  const { query } = useRouter();
  const { slug: datasetIdentifier } = query;

  const [_, setStale] = useCacheStore(DATASET_SHARE_MODAL_INFO_CACHE_KEY);

  const [setGroupPermission, isGrantingDatasetGroupAccess] =
    useMutation<manageDatasetSetDatasetGroupPermissionMutationT>(
      manageDatasetSetDatasetGroupPermissionMutation
    );

  const grantGroupDatasetAccess = useCallback(
    async (
      group: Group,
      permission: DatasetPermission,
      onComplete: (group: ManageDatasetAccessGroup) => void
    ) => {
      const { id, name } = group;
      const variables: any = {
        datasetIdentifier,
        permission,
        id,
      };
      if (id) variables.id = id;

      setGroupPermission({
        successMessage: `Successfully granted special access on the dataset to group ${name}`,
        errorMessage: `Failed to grant special access to group ${name}`,
        variables,
        onCompleted({
          setDatasetUserGroupPermission: { userGroup },
        }: manageDatasetSetDatasetGroupPermissionMutation$dataT) {
          if (id && userGroup) {
            if (userGroup) {
              onComplete({
                ...userGroup,
                groupId: userGroup.id,
              } as ManageDatasetAccessGroup);
            }
            setStale(true);
          }
        },
      });
    },
    []
  );

  return {
    grantGroupDatasetAccess,
    isGrantingDatasetGroupAccess,
  };
}

export default useGrantGroupDatasetAccess;
