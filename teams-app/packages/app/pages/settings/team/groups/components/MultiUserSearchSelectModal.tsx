import { withSuspense } from "@fiftyone/hooks";
import { Dialog } from "@fiftyone/teams-components";
import {
  multiUserSearchSelectModalOpenState,
  User,
} from "@fiftyone/teams-state";
import { Stack } from "@mui/material";
import { capitalize } from "lodash";
import { Suspense, useState } from "react";
import { useRecoilState } from "recoil";
import MultiUserSearchSelectModalTitle from "./MultiUserSearchSelectModalTitle";

import ManageUser from "pages/datasets/[slug]/manage/access/components/ManageUser";
import UserInputSuggestion from "pages/datasets/[slug]/manage/access/components/UserInputSuggestion";

interface Props {
  onSelectUsers: (userIds: string[]) => any;
  loading: boolean;
  onlyExistingUsers?: boolean; // only existing users can be added
}
function MultiUserSearchSelectModal(props: Props) {
  const { onSelectUsers, loading } = props;
  const [open, setOpen] = useRecoilState(multiUserSearchSelectModalOpenState);
  const [selectedUsers, setSelectedUsers] = useState<Record<string, User>>({});
  const [permission, setPermission] = useState<any>("VIEW");

  function closeDialog() {
    setOpen(false);
    setSelectedUsers({});
    setPermission("VIEW");
  }

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title={<MultiUserSearchSelectModalTitle />}
      fullWidth
      disableConfirmationButton={!Object.keys(selectedUsers).length || loading}
      confirmationButtonText="Add users"
      loading={loading}
      onConfirm={() => {
        onSelectUsers(Object.keys(selectedUsers));
      }}
    >
      <Stack spacing={2}>
        <Suspense>
          <UserInputSuggestion
            onlyExistingUsers
            user={null}
            onSelectUser={(user: User | null) => {
              if (user?.id) {
                const newSelectedUsers = { ...selectedUsers };
                newSelectedUsers[user.id] = user;
                setSelectedUsers(newSelectedUsers);
              }
            }}
          />
        </Suspense>
        {Object.values(selectedUsers).map((user: User) => {
          return (
            <ManageUser
              key={user.id}
              target={user}
              permission={permission}
              hideRole
              userCardProps={{ email: capitalize(user.role) }}
              onDelete={() => {
                const newSelectedUsers = { ...selectedUsers };
                delete newSelectedUsers[user.id];
                setSelectedUsers(newSelectedUsers);
              }}
            />
          );
        })}
      </Stack>
    </Dialog>
  );
}

export default withSuspense(MultiUserSearchSelectModal, () => null);
