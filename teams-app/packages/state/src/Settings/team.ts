import {
  CONSTANT_VARIABLES,
  recoilEnvironmentKey
} from '@fiftyone/teams-state';
import Router from 'next/router';
import { graphql } from 'react-relay';
import { RecoilState, atom, selector } from 'recoil';
import { graphQLSelector } from 'recoil-relay';
import { changeRoute } from '../routing.utils';
import { PARAMS } from '../urlSyncCommon';
import * as usersListQuery from './__generated__/teamUsersListQuery.graphql';

const {
  DEFAULT_PAGE,
  DEFAULT_USERS_PAGE_SIZE,
  DEFAULT_USER_DATASETS_LIST_PAGE,
  DEFAULT_USER_DATASETS_LIST_PAGE_SIZE
} = CONSTANT_VARIABLES;

export const teamUsersListQuery = graphql`
  query teamUsersListQuery(
    $search: UserSearchFieldsSearch
    $page: Int!
    $pageSize: Int!
    $order: UserOrderFieldsOrder
  ) {
    usersPage(
      search: $search
      page: $page
      pageSize: $pageSize
      order: $order
    ) {
      pageTotal
      nodeTotal
      nodes {
        datasetsCount
        email
        id
        name
        role
        picture
      }
    }
  }
`;

export const teamSetUserRoleMutation = graphql`
  mutation teamSetUserRoleMutation($role: UserRole!, $userId: String!) {
    setUserRole(role: $role, userId: $userId) {
      name
      role
      id
    }
  }
`;

export const teamRemoveUserMutation = graphql`
  mutation teamRemoveUserMutation($userId: String!) {
    removeUser(userId: $userId)
  }
`;

export const teamInvitationsQuery = graphql`
  query teamInvitationsQuery {
    invitations {
      createdAt
      expiresAt
      id
      inviteeEmail
      inviteeRole
      url
    }
  }
`;

export const teamUsersAuditQuery = graphql`
  query teamGetUsersAuditQuery {
    usersAudit {
      users {
        current
        remaining
      }
      collaborators {
        current
        remaining
      }
      guests {
        current
        remaining
      }
    }
  }
`;

export const teamSendUserInvitationMutation = graphql`
  mutation teamSendUserInvitationMutation($email: String!, $role: UserRole!) {
    sendUserInvitation(email: $email, role: $role) {
      __typename
      createdAt
      expiresAt
      id
      inviteeEmail
      inviteeRole
      url
    }
  }
`;

export const teamRevokeInvitationMutation = graphql`
  mutation teamRevokeInvitationMutation($invitationId: String!) {
    revokeUserInvitation(invitationId: $invitationId)
  }
`;

export const teamUserQuery = graphql`
  query teamUserQuery($userId: String!) {
    user(id: $userId) {
      datasetsCount
      email
      name
      picture
    }
  }
`;

export const teamUserDatasetsPageQuery = graphql`
  query teamUserDatasetsPageQuery(
    $userId: String!
    $page: Int!
    $pageSize: Int!
    $filter: DatasetFilter
  ) {
    user(id: $userId) {
      datasetsPage: datasetsPage(
        page: $page
        pageSize: $pageSize
        filter: $filter
      ) {
        nodes {
          name
          id
          samplesCount
          user(id: $userId) {
            activePermission
            userPermission
          }
        }
        pageTotal
      }
    }
  }
`;

export const teamRemoveTeammateOpenState = atom({
  key: 'teamRemoveTeammateOpenState',
  default: false
});

export const teamRemoveTeammateTargetState = atom({
  key: 'teamRemoveTeammateTargetState',
  default: {
    name: '',
    slug: '',
    open: false
  }
});

export const teamInvitationFormState = atom({
  key: 'teamInvitationFormState',
  default: {
    email: '',
    id: '',
    role: 'MEMBER'
  }
});

export const currentInviteeState = atom<{ role: string }>({
  key: 'currentInviteeState',
  default: undefined
});

// todo: combine into single large query for the whole setting > team page
export const teamInvitationsSelector = graphQLSelector({
  key: 'teamInvitationsSelector',
  environment: recoilEnvironmentKey,
  query: teamInvitationsQuery,
  variables: {},
  mapResponse: ({ invitations }) => {
    return invitations;
  }
});

export const settingsTeamSelectedUserId = atom({
  key: 'settingsTeamSelectedUserId',
  default: ''
});

export const settingsTeamInviteTeammateOpen = atom({
  key: 'settingsTeamInviteTeammateOpen',
  default: false
});

export const settingsTeamUserDatasetsByInvitePageState = atom({
  key: 'settingsTeamUserDatasetsByInvitePageState',
  default: {
    page: DEFAULT_USER_DATASETS_LIST_PAGE,
    pageSize: DEFAULT_USER_DATASETS_LIST_PAGE_SIZE
  }
});

export const settingsTeamUserDatasetsPageState = atom({
  key: 'settingsTeamUserDatasetsPageState',
  default: {
    page: DEFAULT_USER_DATASETS_LIST_PAGE,
    pageSize: DEFAULT_USER_DATASETS_LIST_PAGE_SIZE
  }
});

export const settingsTeamUserDatasetsUpdateCount = atom({
  key: 'settingsTeamUserDatasetsUpdateCount',
  default: 0
});
export interface UserListingSearchExpression {
  fields: string[];
  term: string;
}

type UsersListingSearchFields = usersListQuery.UserSearchFields;
const defaultSearchListingFields: UsersListingSearchFields[] = [
  'name',
  'email'
];
// TODO: when last joined datetime is available, we should allow sort by that
const SORT_OPTIONS = [
  {
    field: 'name',
    direction: 'ASC',
    displayName: 'Name A-Z'
  },
  {
    field: 'name',
    direction: 'DESC',
    displayName: 'Name Z-A'
  }
];

export const USER_TEAM_PATH = '/settings/team/users';

export interface UserListingSearchExpression {
  fields: string[];
  term: string;
}

export const userListUsersCountState = atom({
  key: 'userListUsersCountState',
  default: null
});

export const userListInvitationsCountState = atom({
  key: 'userListInvitationsCountState',
  default: null
});

export const userListPageInfoState = atom({
  key: 'userListPageInfoState',
  default: { page: DEFAULT_PAGE, pageSize: DEFAULT_USERS_PAGE_SIZE },
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf({
          page: Number(Router.query?.page || 1),
          pageSize: Number(Router.query?.pageSize || DEFAULT_USERS_PAGE_SIZE)
        });
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            pathname: USER_TEAM_PATH,
            params: newValue,
            resetPage: false
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const pageSize = Number(
          urlPram.get(PARAMS.PAGE_SIZE) || DEFAULT_USERS_PAGE_SIZE
        );
        const page = Number(urlPram.get(PARAMS.PAGE) || 1);
        setSelf({ page, pageSize });
      });
    }
  ]
});

export const userSearchInputState = atom({
  key: 'userSearchInput',
  default: '',
  effects: [
    ({ trigger, setSelf, getPromise }) => {
      if (trigger == 'get') {
        const search = Router.query?.search;
        if (search) {
          setSelf(search as string);
        } else {
          if (Router.asPath.includes(USER_TEAM_PATH)) {
            delete Router.query?.[PARAMS.SEARCH];
            Router.replace({
              pathname: USER_TEAM_PATH,
              query: Router.query
            });
          }
        }
      }
      Router.events.on('routeChangeComplete', async () => {
        const input = await getPromise(userSearchInputState);
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const searchParam = urlPram.get(PARAMS.SEARCH);
        // only set self if there is no input but there is search param in the url
        if (searchParam && !input) {
          setSelf(searchParam);
        } else if (!searchParam) {
          setSelf('');
        }
      });
    }
  ]
});

export const searchUserTermState = atom({
  key: 'searchUser',
  default: '',
  effects: [
    ({ trigger, onSet, setSelf, getPromise }) => {
      if (trigger == 'get') {
        setSelf(Router.query?.search as string);
      }
      onSet(async (_, __, isReset) => {
        if (isReset) {
          delete Router.query?.[PARAMS.SEARCH];
          const { pageSize } = await getPromise(userListPageInfoState);
          changeRoute({
            params: {
              ...Router.query,
              ...{ page: 1, pageSize }
            }
          });
        }
      });
    }
  ]
});

export const userSearchTermState: RecoilState<UserListingSearchExpression | null> =
  atom({
    key: 'userSearchTermState',
    default: null,
    effects: [
      ({ trigger, onSet, setSelf, getPromise }) => {
        if (trigger == 'get') {
          setSelf(
            toSearchUserFilter({
              term: Router.query?.search as string,
              fields: []
            })
          );
        }
        onSet(async (newValue, oldValue, isReset) => {
          // handle reset search input here
          if (isReset) {
            delete Router.query?.[PARAMS.SEARCH];
            const { pageSize } = await getPromise(userListPageInfoState);
            changeRoute({
              pathname: USER_TEAM_PATH,
              params: {
                ...Router.query,
                ...{ page: 1, pageSize }
              }
            });
            return;
          }

          if (oldValue !== newValue) {
            changeRoute({
              pathname: USER_TEAM_PATH,
              params: { search: newValue.term },
              deleteParams: !newValue.term ? new Set(['search']) : new Set()
            });
          }
        });
        Router.events.on('routeChangeComplete', () => {
          const queryString = window.location.search;
          const urlPram = new URLSearchParams(queryString);
          const searchParam = urlPram.get(PARAMS.SEARCH);
          setSelf(
            toSearchUserFilter({
              term: searchParam,
              fields: []
            })
          );
        });
      }
    ]
  });

export const userListSortState = atom({
  key: 'userListSortState',
  default: SORT_OPTIONS[0],
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf(getCurrentSortOption());
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            pathname: USER_TEAM_PATH,
            params: {
              [PARAMS.ORDER_FIELD]: newValue.field,
              [PARAMS.ORDER_DIRECTION]: newValue.direction.toLowerCase()
            }
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        setSelf(getCurrentSortOption());
      });
    }
  ]
});

// this is from datasets, move it to common
const getCurrentSortOption = () => {
  const querySortField = Router.query?.[PARAMS.ORDER_FIELD];
  const querySortDirection = (
    Router.query?.[PARAMS.ORDER_DIRECTION] as string
  )?.toUpperCase();
  return (
    SORT_OPTIONS.filter(({ field, direction }) => {
      return field === querySortField && direction === querySortDirection;
    })?.[0] || SORT_OPTIONS[0]
  );
};

export const toSearchUserFilter = (search: UserListingSearchExpression) => {
  if (!search?.term) {
    return {
      fields: defaultSearchListingFields,
      term: ''
    };
  }
  const rawSearch = decodeURIComponent(search.term);

  const rawSplit = rawSearch.split(':');
  let fields = search.fields.length
    ? search.fields
    : defaultSearchListingFields;
  let term = rawSearch;

  if (rawSplit.length > 1) {
    let potentialFieldRaw = rawSplit[0];
    const potentialValue = rawSplit[1] as string;

    const potentialField = potentialFieldRaw as UsersListingSearchFields;

    if (defaultSearchListingFields.includes(potentialField) && potentialValue) {
      fields = [potentialField];
      term = potentialValue;
    }
  }

  return {
    fields,
    term
  };
};
