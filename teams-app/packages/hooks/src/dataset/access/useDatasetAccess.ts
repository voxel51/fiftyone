import { useMutation } from "@fiftyone/hooks";
import {
  manageDatasetSetDatasetGroupPermissionMutation,
  manageDatasetSetDatasetUserPermissionMutation,
  manageDatasetRemoveDatasetGroupPermissionMutation,
  manageDatasetRemoveDatasetUserPermissionMutation,
  ManageDatasetAccessTarget,
  DatasetPermission,
} from "@fiftyone/teams-state";

export function isGroupType(targetRef: ManageDatasetAccessTarget): boolean {
  return targetRef.__typename === "DatasetUserGroup";
}

export default function useDatasetAccess(
  finalItems: ManageDatasetAccessTarget[]
) {
  const [setGroupPermission] = useMutation(
    manageDatasetSetDatasetGroupPermissionMutation
  );
  const [setUserPermission] = useMutation(
    manageDatasetSetDatasetUserPermissionMutation
  );
  const [removeGroupPermission] = useMutation(
    manageDatasetRemoveDatasetGroupPermissionMutation
  );
  const [removeUserPermission] = useMutation(
    manageDatasetRemoveDatasetUserPermissionMutation
  );

  const setPermission = (
    item: ManageDatasetAccessTarget,
    newPermission: DatasetPermission,
    datasetIdentifier: string,
    onCompleted: (items: ManageDatasetAccessTarget[]) => void,
    onError?: (error: Error) => void
  ) => {
    const isGroup = isGroupType(item);
    const mutation = isGroup ? setGroupPermission : setUserPermission;
    mutation({
      variables: {
        datasetIdentifier,
        ...(isGroup ? { id: item.groupId } : { userId: item.userId }),
        permission: newPermission,
      },
      successMessage: "Successfully updated special access on the dataset",
      errorMessage: "Failed to update special access on the dataset",
      onCompleted: () => {
        const newItem: ManageDatasetAccessTarget = {
          ...item,
          ...(isGroup
            ? { permission: newPermission }
            : { userPermission: newPermission }),
        };
        const updatedItems = finalItems.map((existingItem) => {
          const id = existingItem?.groupId || existingItem?.userId;
          return id === (item?.groupId || item?.userId)
            ? newItem
            : existingItem;
        });
        if (onCompleted) onCompleted(updatedItems);
      },
      onError,
    });
  };

  const removeAccess = (
    item: ManageDatasetAccessTarget,
    datasetIdentifier: string,
    onCompleted: (items: ManageDatasetAccessTarget[]) => void,
    onError?: (error: Error) => void
  ) => {
    const mutation = item.groupId
      ? removeGroupPermission
      : removeUserPermission;
    mutation({
      variables: {
        datasetIdentifier,
        ...(item.groupId
          ? { groupIdentifier: item.groupId }
          : { userId: item.userId }),
      },
      successMessage: "Successfully removed special access on the dataset",
      errorMessage: "Failed to remove special access on the dataset",
      onCompleted: () => {
        const updatedItems = finalItems.filter((existingItem) =>
          item.groupId
            ? existingItem.groupId !== item.groupId
            : existingItem.userId !== item.userId
        );
        if (onCompleted) onCompleted(updatedItems);
      },
      onError: (error: Error) => {
        console.error("Mutation error:", error);
        if (onError) onError(error);
      },
    });
  };

  return { setPermission, removeAccess };
}
