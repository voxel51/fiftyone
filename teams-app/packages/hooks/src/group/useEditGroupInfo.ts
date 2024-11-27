import { useMutation } from "../common";
import {
  groupsEditUserGroupInfoMutation,
  groupsEditUserGroupInfoMutationT,
} from "@fiftyone/teams-state";
import { useCallback } from "react";
import { useRouter } from "next/router";

interface Props {
  identifier: string;
  name: string;
  description?: string;
  successMessage?: string;
  errorMessage?: string;
  onComplete?: (data) => void;
  onHandleError?: (error) => void;
}

const ROUTE = "/settings/team/groups";

export default function useEditGroupInfo() {
  const router = useRouter();
  const [editGroupInfoMutation, loading] =
    useMutation<groupsEditUserGroupInfoMutationT>(
      groupsEditUserGroupInfoMutation
    );

  const editGroup = useCallback(
    (props: Props) => {
      const {
        identifier,
        name,
        description,
        successMessage,
        errorMessage,
        onComplete,
        onHandleError,
      } = props;
      return editGroupInfoMutation({
        variables: {
          identifier,
          name,
          description,
        },
        successMessage: successMessage || `Successfully updated group info`,
        errorMessage: errorMessage || `Failed to update group info`,
        onCompleted: (data) => {
          const updatedGroupSlug = data?.updateUserGroupInfo?.slug;
          if (updatedGroupSlug !== router.query.slug) {
            if (router.asPath.endsWith(ROUTE)) {
              // list page
              router.push(ROUTE);
            } else if (router.asPath.includes(ROUTE)) {
              // detail page
              router.push(ROUTE + `/${updatedGroupSlug}`);
            }
          } else {
            // other properties change - ex: description
            router.replace(router.asPath);
          }
          onComplete && onComplete(data);
        },
        onError: (error) => onHandleError && onHandleError(error),
      });
    },
    [router]
  );

  return {
    editGroup,
    isEditingGroup: loading,
  };
}
