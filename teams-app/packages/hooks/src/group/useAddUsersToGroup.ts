import { groupAddUsersMutation } from "@fiftyone/teams-state";
import { useMutation } from "../common";
import { groupAddUsersMutation as GroupAddUsersMutation } from "@fiftyone/teams-state/src/Settings/__generated__/groupAddUsersMutation.graphql";
import { useCallback } from "react";
import { useRouter } from "next/router";

export default function useAddUsersToGroup() {
  const router = useRouter();
  const [addUsersToGroupMutation, loading] = useMutation<GroupAddUsersMutation>(
    groupAddUsersMutation
  );

  const addUsersToGroup = useCallback(
    (
      userIds: string[],
      onComplete: () => void,
      successMessage?: string,
      errorMessage?: string
    ) => {
      return addUsersToGroupMutation({
        variables: {
          user_ids: userIds,
          user_group_identifier: router.query.slug as string,
        },
        onCompleted: () => {
          router.push(`/settings/team/groups/${router.query.slug}`);
          onComplete && onComplete();
        },
        successMessage: successMessage || "Successfully added user to group!",
        errorMessage: errorMessage || "Failed to add user to group",
      });
    },
    [router]
  );

  return {
    addUsersToGroup,
    isAddingUsersToGroup: loading,
  };
}
