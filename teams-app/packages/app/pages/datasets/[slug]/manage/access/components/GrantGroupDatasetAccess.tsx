import { withSuspense } from "@fiftyone/hooks";
import { Dialog } from "@fiftyone/teams-components";
import {
  DatasetPermission,
  Group,
  manageAccessItemsState,
  ManageDatasetAccessGroup,
  manageDatasetGrantGroupAccessOpenState,
} from "@fiftyone/teams-state";
import { Stack } from "@mui/material";
import { capitalize } from "lodash";
import { Suspense, useCallback, useState } from "react";
import { useRecoilState } from "recoil";
import GrantDatasetAccessTitle from "./GrantDatasetAccessTitle";
import GroupInputSuggestion from "./GroupInputSuggestion";
import ManageGroup from "./ManageGroup";
import useGrantGroupDatasetAccess from "@fiftyone/hooks/src/dataset/access/useGrantGroupDatasetAccess";

function GrantGroupDatasetAccess() {
  const [open, setOpen] = useRecoilState(
    manageDatasetGrantGroupAccessOpenState
  );
  const [group, setGroup] = useState<Group | null>(null);
  const [permission, setPermission] = useState<DatasetPermission>("VIEW");

  const [accessItems, setAccessItems] = useRecoilState(manageAccessItemsState);
  const { grantGroupDatasetAccess, isGrantingDatasetGroupAccess } =
    useGrantGroupDatasetAccess();

  const closeDialog = useCallback(() => {
    setOpen(false);
    setGroup(null);
  }, [setOpen]);

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title={<GrantDatasetAccessTitle isGroup={true} />}
      fullWidth
      disableConfirmationButton={!group || isGrantingDatasetGroupAccess}
      confirmationButtonText="Grant access"
      loading={isGrantingDatasetGroupAccess}
      onConfirm={() => {
        if (group) {
          closeDialog();
          grantGroupDatasetAccess(
            group,
            permission,
            (newGroup: ManageDatasetAccessGroup) => {
              setAccessItems([
                {
                  ...newGroup,
                  groupId: newGroup.id,
                } as ManageDatasetAccessGroup,
                ...accessItems,
              ]);
            }
          );
        }
      }}
    >
      <Stack spacing={2}>
        <Suspense>
          <GroupInputSuggestion group={group} onSelectGroup={setGroup} />
        </Suspense>
        {group && (
          <ManageGroup
            group={group}
            permission={permission}
            cardProps={{ email: capitalize(group.description) }}
            onDelete={() => {
              setGroup(null);
            }}
            onPermissionChange={(permission: DatasetPermission) => {
              setPermission(permission);
            }}
          />
        )}
      </Stack>
    </Dialog>
  );
}

export default withSuspense(GrantGroupDatasetAccess, () => null);
