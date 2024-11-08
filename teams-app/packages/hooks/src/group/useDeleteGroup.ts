import { useMutation } from "../common";
import {
  groupsDeleteUserGroupMutationT,
  groupsDeleteUserGroupMutation,
} from "@fiftyone/teams-state";
import { useCallback } from "react";
import { useRouter } from "next/router";

export default function useDeleteGroup() {
  const router = useRouter();
  const [deleteGroupMutation, loading] =
    useMutation<groupsDeleteUserGroupMutationT>(groupsDeleteUserGroupMutation);

  const deleteGroup = useCallback(
    (
      id: string,
      successMessage?: string,
      errorMessage?: string,
      onComplete?: (data: any) => void,
      onHandleError?: (error: any) => void
    ) => {
      return deleteGroupMutation({
        variables: {
          id,
        },
        successMessage,
        errorMessage,
        onCompleted: (data) => onComplete && onComplete(data),
        onError: (error) => onHandleError && onHandleError(error),
      });
    },
    [router]
  );

  return {
    deleteGroup,
    isDeletingGroup: loading,
  };
}
