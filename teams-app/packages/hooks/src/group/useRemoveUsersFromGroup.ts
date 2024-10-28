import { groupRemoveUsersMutation } from "@fiftyone/teams-state";
import { useMutation } from "../common";
import { groupRemoveUsersMutation as GroupRemoveUsersMutation } from "@fiftyone/teams-state/src/Settings/__generated__/groupRemoveUsersMutation.graphql";
import { useCallback } from "react";
import { useRouter } from "next/router";

export default function useRemoveUsersFromGroup() {
  const router = useRouter();
  const [removeUsersFromGroupMutation, loading] =
    useMutation<GroupRemoveUsersMutation>(groupRemoveUsersMutation);

  const removeUsersFromGroup = useCallback(
    (
      userIds: string[],
      onComplete?: () => void,
      successMessage?: string,
      errorMessage?: string
    ) => {
      return removeUsersFromGroupMutation({
        variables: {
          user_ids: userIds,
          user_group_identifier: router.query.slug as string,
        },
        onCompleted: () => {
          router.push(`/settings/team/groups/${router.query.slug}`);
          onComplete && onComplete();
        },
        successMessage:
          successMessage || "Successfully removed used from group",
        errorMessage: errorMessage || "Failed to remove user from group",
      });
    },
    [router]
  );

  return {
    removeUsersFromGroup,
    isRemovingUsersFromGroup: loading,
  };
}
