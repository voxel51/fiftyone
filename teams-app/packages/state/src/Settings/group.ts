import { graphql } from "react-relay";
import { atom } from "recoil";
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from "../constants";
import Router from "next/router";
import { changeRoute } from "../routing.utils";
import { PARAMS } from "../urlSyncCommon";
import { User } from "../User";

export interface UserGroup {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  users: User[];
  usersCount: number;
}

export const GroupUserFrag = graphql`
  fragment groupUsersFragment on User {
    id
    name
    email
    picture
    role
    # userGroups { // NOTE: This causes auth0 limit issue - needs api tweaks
    #   id
    #   name
    #   slug
    #   description
    # }
  }
`;

export const groupUsersQuery = graphql`
  query groupUsersQuery($identifier: String!, $page: Int!, $pageSize: Int!) {
    userGroup(identifier: $identifier) {
      id
      name
      slug
      description
      usersCount
      usersPage(page: $page, pageSize: $pageSize) {
        pageTotal
        nodes {
          ...groupUsersFragment
        }
      }
    }
  }
`;

export const groupAddUsersMutation = graphql`
  mutation groupAddUsersMutation(
    $user_group_identifier: String!
    $user_ids: [String!]!
  ) {
    addUserGroupUsers(
      userGroupIdentifier: $user_group_identifier
      userIds: $user_ids
    ) {
      id
      name
      description
      users {
        ...groupUsersFragment
      }
    }
  }
`;

export const groupRemoveUsersMutation = graphql`
  mutation groupRemoveUsersMutation(
    $user_group_identifier: String!
    $user_ids: [String!]!
  ) {
    removeUserGroupUsers(
      userGroupIdentifier: $user_group_identifier
      userIds: $user_ids
    ) {
      id
      name
      description
      users {
        ...groupUsersFragment
      }
    }
  }
`;

export const multiUserSearchSelectModalOpenState = atom<boolean>({
  key: "multiUserSearchSelectModalOpenState",
  default: false,
});

export const currentUserGroup = atom<UserGroup | null>({
  key: "currentUserGroup",
  default: null,
});

export const groupUsersPageInfo = atom({
  key: "groupUsersPageInfo",
  default: { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE },
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == "get") {
        setSelf({
          page: Number(Router.query?.page || DEFAULT_PAGE),
          pageSize: Number(Router.query?.pageSize || DEFAULT_PAGE_SIZE),
        });
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            pathname: `/settings/team/groups/${Router.query.slug}`,
            params: newValue,
            resetPage: false,
            deleteParams: new Set(["slug"]),
          });
        }
      });
      Router.events.on("routeChangeComplete", () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const pageSize = Number(
          urlPram.get(PARAMS.PAGE_SIZE) || DEFAULT_PAGE_SIZE
        );
        const page = Number(urlPram.get(PARAMS.PAGE) || DEFAULT_PAGE);
        setSelf({ page, pageSize });
      });
    },
  ],
});
