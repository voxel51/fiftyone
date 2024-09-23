import {
  CONSTANT_VARIABLES,
  DatasetPermission,
  recoilEnvironmentKey,
} from "@fiftyone/teams-state";
import { graphql } from "react-relay";
import { atom } from "recoil";
import { graphQLSelector, graphQLSelectorFamily } from "recoil-relay";
import { UserRole } from "./__generated__/manageDatasetGetAccessPageQuery.graphql";

const { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } = CONSTANT_VARIABLES;

interface ManageDatasetAccessBase {
  readonly __typename: "DatasetUser" | "DatasetUserGroup";
  id: string;
  name: string;
  description?: string;
}

export interface ManageDatasetAccessUser extends ManageDatasetAccessBase {
  activePermission: DatasetPermission;
  email: string;
  picture: string;
  role: UserRole;
  userId: string;
  userPermission: DatasetPermission;
}

export interface ManageDatasetAccessGroup extends ManageDatasetAccessBase {
  groupId: string;
  permission: DatasetPermission;
  slug: string;
}

export type ManageDatasetAccessTarget =
  | ManageDatasetAccessUser
  | ManageDatasetAccessGroup;

export const manageDatasetDefaultAccessInfoQuery = graphql`
  query manageDatasetDefaultAccessInfoQuery($identifier: String!) {
    dataset(identifier: $identifier) {
      usersCount(filter: { userRole: { in: [ADMIN, MEMBER] } })
      defaultPermission
    }
  }
`;

export const manageDatasetPeopleWithAccessQuery = graphql`
  query manageDatasetPeopleWithAccessQuery(
    $identifier: String!
    $page: Int!
    $pageSize: Int!
  ) {
    dataset(identifier: $identifier) {
      usersPage(
        page: $page
        pageSize: $pageSize
        filter: { userPermission: { ne: null } }
      ) {
        pageTotal
        nodes {
          user {
            email
            id
            name
            role
            picture
          }
          userPermission
          activePermission
        }
      }
    }
  }
`;

// Define the fragments
export const datasetFrag = graphql`
  fragment manageDatasetGetAccessPage_datasetFrag on Dataset {
    slug
    defaultPermission
  }
`;

export const userFrag = graphql`
  fragment manageDatasetGetAccessPage_userFrag on DatasetUser {
    userId: id
    email
    name
    role
    picture
    userPermission
    activePermission
    attributes {
      ...UserAttrFrag
    }
  }
`;

export const groupFrag = graphql`
  fragment manageDatasetGetAccessPage_groupFrag on DatasetUserGroup {
    groupId: id
    name
    slug
    permission
    description
  }
`;

export const accessFrag = graphql`
  fragment manageDatasetGetAccessPage_accessFrag on DatasetAccess {
    __typename
    ... on DatasetUser {
      ...manageDatasetGetAccessPage_userFrag
    }
    ... on DatasetUserGroup {
      ...manageDatasetGetAccessPage_groupFrag
    }
  }
`;

// Define the query for accessing a page of dataset access entries
export const manageDatasetGetAccessPageQuery = graphql`
  query manageDatasetGetAccessPageQuery(
    $datasetIdentifier: String!
    $page: Int!
    $pageSize: Int!
  ) {
    dataset(identifier: $datasetIdentifier) {
      accessPage(
        userFilter: { userPermission: { ne: null } }
        page: $page
        pageSize: $pageSize
      ) {
        nodes {
          __typename
          ... on DatasetUser {
            userId: id
            email
            name
            role
            picture
            userPermission
            activePermission
          }
          ... on DatasetUserGroup {
            groupId: id
            name
            slug
            permission
            description
          }
        }
        nodeTotal
        next
        page
        pageSize
        pageTotal
        prev
      }
    }
  }
`;
export const manageDatasetUsersSuggestionQuery = graphql`
  query manageDatasetUsersSuggestionQuery($term: String!) {
    users(first: 10, search: { term: $term, fields: [email, name] }) {
      id
      email
      name
      role
      picture
      # userGroups { // NOTE: This causes auth0 limit issue - needs api tweaks
      #   id
      #   name
      #   slug
      # }
    }
  }
`;

export const manageDatasetGroupsSuggestionQuery = graphql`
  query manageDatasetGroupsSuggestionQuery($term: String!) {
    userGroups(first: 10, search: { term: $term, fields: [name, slug] }) {
      id
      slug
      name
      description
      usersCount
      users {
        id
        name
        email
        role
      }
    }
  }
`;

export const manageDatasetSetDatasetDefaultPermissionMutation = graphql`
  mutation manageDatasetSetDatasetDefaultPermissionMutation(
    $datasetIdentifier: String!
    $permission: DatasetPermission!
  ) {
    setDatasetDefaultPermission(
      datasetIdentifier: $datasetIdentifier
      permission: $permission
    ) {
      defaultPermission
      id
    }
  }
`;

export const manageDatasetSetDatasetUserPermissionMutation = graphql`
  mutation manageDatasetSetDatasetUserPermissionMutation(
    $datasetIdentifier: String!
    $userId: String!
    $permission: DatasetPermission!
  ) {
    setDatasetUserPermission(
      datasetIdentifier: $datasetIdentifier
      userId: $userId
      permission: $permission
    ) {
      user(id: $userId) {
        user {
          email
          id
          name
          role
          picture
        }
        userPermission
        activePermission
      }
    }
  }
`;

export const manageDatasetSetDatasetGroupPermissionMutation = graphql`
  mutation manageDatasetSetDatasetGroupPermissionMutation(
    $datasetIdentifier: String!
    $id: String!
    $permission: DatasetPermission!
  ) {
    setDatasetUserGroupPermission(
      datasetIdentifier: $datasetIdentifier
      userGroupIdentifier: $id
      permission: $permission
    ) {
      userGroup(identifier: $id) {
        id
        __typename
        name
        permission
        description
        slug
      }
      createdAt
      defaultPermission
      description
      id
      lastLoadedAt
      mediaType
      name
      sampleFieldsCount
      slug
      tags
    }
  }
`;

export const manageDatasetGetGroupsCountQuery = graphql`
  query manageDatasetGetGroupsCountQuery($identifier: String!) {
    dataset(identifier: $identifier) {
      userGroupsCount
    }
  }
`;

export const manageDatasetInviteUserToDatasetMutation = graphql`
  mutation manageDatasetInviteUserToDatasetMutation(
    $datasetIdentifier: String!
    $email: Email!
    $permission: DatasetPermission!
    $role: UserRole
  ) {
    setDatasetUserPermission(
      datasetIdentifier: $datasetIdentifier
      email: $email
      permission: $permission
      role: $role
    ) {
      id
    }
  }
`;

export const manageDatasetRemoveDatasetUserPermissionMutation = graphql`
  mutation manageDatasetRemoveDatasetUserPermissionMutation(
    $datasetIdentifier: String!
    $userId: String!
  ) {
    removeDatasetUserPermission(
      datasetIdentifier: $datasetIdentifier
      userId: $userId
    ) {
      id
    }
  }
`;

export const manageDatasetRemoveDatasetGroupPermissionMutation = graphql`
  mutation manageDatasetRemoveDatasetGroupPermissionMutation(
    $datasetIdentifier: String!
    $groupIdentifier: String!
  ) {
    removeDatasetUserGroupPermission(
      datasetIdentifier: $datasetIdentifier
      userGroupIdentifier: $groupIdentifier
    ) {
      id
    }
  }
`;

export const manageDatasetRemoveDatasetMutation = graphql`
  mutation manageDatasetRemoveDatasetMutation($identifier: String!) {
    deleteDataset(identifier: $identifier)
  }
`;

export const manageDatasetGrantUserAccessOpenState = atom({
  key: "manageDatasetGrantUserAccessOpenState",
  default: false,
});

export const manageDatasetGrantGroupAccessOpenState = atom({
  key: "manageDatasetGrantGroupAccessOpenState",
  default: false,
});

export const manageDatasetUsersSuggestionTermState = atom({
  key: "manageDatasetUsersSuggestionTermState",
  default: "",
});

export const manageDatasetGroupsSuggestionTermState = atom({
  key: "manageDatasetGroupsSuggestionTermState",
  default: "",
});

export const manageDatasetUsersSuggestion = graphQLSelector({
  key: "manageDatasetUsersSuggestion",
  environment: recoilEnvironmentKey,
  query: manageDatasetUsersSuggestionQuery,
  variables: ({ get }) => {
    const searchTerm = get(manageDatasetUsersSuggestionTermState);
    if (searchTerm) return { term: searchTerm };
    return null;
  },
  mapResponse: (result) => {
    return result.users;
  },
});

export const manageDatasetGroupsSuggestion = graphQLSelector({
  key: "manageDatasetGroupsSuggestion",
  environment: recoilEnvironmentKey,
  query: manageDatasetGroupsSuggestionQuery,
  variables: ({ get }) => {
    const searchTerm = get(manageDatasetGroupsSuggestionTermState);
    if (searchTerm) return { term: searchTerm };
    return null;
  },
  mapResponse: (result) => {
    return result.userGroups;
  },
});

export const manageDatasetGetAccessPageState = atom({
  key: "manageDatasetGetAccessPageState",
  default: {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  },
});

export const manageDatasetPeopleWithAccessPageState = atom({
  key: "manageDatasetPeopleWithAccessPageState",
  default: {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
  },
});

export const manageDatasetPeopleWithAccessSelector = graphQLSelectorFamily({
  key: "teamInvitationsSelector",
  environment: recoilEnvironmentKey,
  query: manageDatasetPeopleWithAccessQuery,
  variables:
    (identifier) =>
    ({ get }) => {
      const pageState = get(manageDatasetPeopleWithAccessPageState);
      return { identifier, ...pageState };
    },
  mapResponse: (result) => {
    return result?.dataset?.usersPage;
  },
});

export const manageDatasetTargetsWithAccessSelector = graphQLSelectorFamily({
  key: "manageDatasetTargetsWithAccessSelector",
  environment: recoilEnvironmentKey,
  query: manageDatasetGetAccessPageQuery,
  variables:
    (datasetIdentifier) =>
    ({ get }) => {
      const pageState = get(manageDatasetGetAccessPageState);
      return { datasetIdentifier, ...pageState };
    },
  mapResponse: (result) => {
    return result?.dataset?.accessPage;
  },
});

export const manageAccessItemsState = atom<
  (ManageDatasetAccessUser | ManageDatasetAccessGroup)[]
>({
  key: "manageAccessItemsState",
  default: [],
  effects_UNSTABLE: [
    ({ setSelf, onSet }) => {
      onSet((newItems, _, isReset) => {
        if (isReset) return;

        const uniqueItems = newItems.reduce<
          (ManageDatasetAccessUser | ManageDatasetAccessGroup)[]
        >((acc, item) => {
          const id = "groupId" in item ? item.groupId : item.userId;

          if (
            !acc.some(
              (existingItem) =>
                ("groupId" in existingItem
                  ? existingItem.groupId
                  : existingItem.userId) === id
            )
          ) {
            acc.push(item);
          }
          return acc;
        }, []);

        setSelf(uniqueItems);
      });
    },
  ],
});
