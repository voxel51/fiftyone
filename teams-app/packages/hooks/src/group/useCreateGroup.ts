import { useMutation } from "../common";
import {
  groupsCreateUserGroupMutation,
  groupsCreateUserGroupMutationT,
} from "@fiftyone/teams-state";
import { useCallback } from "react";
import { useRouter } from "next/router";

interface Props {
  name: string;
  description?: string;
  successMessage?: string;
  errorMessage?: string;
  onComplete?: (data) => void;
  onHandleError?: (error) => void;
}

export default function useCreateGroup() {
  const router = useRouter();
  const [createGroupMutation, loading] =
    useMutation<groupsCreateUserGroupMutationT>(groupsCreateUserGroupMutation);

  const createGroup = useCallback(
    (props: Props) => {
      const {
        name,
        description,
        successMessage,
        errorMessage,
        onComplete,
        onHandleError,
      } = props;
      return createGroupMutation({
        variables: {
          name,
          description,
        },
        successMessage:
          successMessage || `Successfully created a group ${name}`,
        errorMessage: errorMessage || "Failed to create a group",
        onCompleted: (data) => {
          const newGroupSlug = data?.createUserGroup?.slug;
          router.push(
            `/settings/team/groups${newGroupSlug ? `/${newGroupSlug}` : ""}`
          );
          onComplete && onComplete(data);
        },
        onError: (error) => onHandleError && onHandleError(error),
      });
    },
    [router]
  );

  return {
    createGroup,
    isCreatingGroup: loading,
  };
}
