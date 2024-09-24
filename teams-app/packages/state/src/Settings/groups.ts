import { graphql } from 'react-relay';
import { RecoilState, atom, selector } from 'recoil';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../constants';
import { changeRoute } from '../routing.utils';
import { PARAMS } from '../urlSyncCommon';
import * as groupsQuery from './__generated__/groupsListQuery.graphql';
import Router from 'next/router';
import { UserGroupOrderFieldsOrder } from '@fiftyone/teams-state/src/Settings/__generated__/groupsListQuery.graphql';

export const GROUPS_PAGE = '/settings/team/groups';

export interface GroupUser {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export interface Group {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly usersCount: number;
  readonly users?: GroupUser[];
}

export const groupsListQuery = graphql`
  query groupsListQuery(
    $search: UserGroupSearchFieldsSearch
    $page: Int!
    $pageSize: Int!
    $order: UserGroupOrderFieldsOrder
  ) {
    userGroupsPage(
      search: $search
      page: $page
      pageSize: $pageSize
      order: $order
    ) {
      pageTotal
      nodeTotal
      nodes {
        id
        slug
        name
        description
        createdAt
        usersCount
        users {
          id
          name
          email
          picture
        }
      }
    }
  }
`;

export const groupsCreateUserGroupMutation = graphql`
  mutation groupsCreateUserGroupMutation($name: String!, $description: String) {
    createUserGroup(name: $name, description: $description) {
      slug
    }
  }
`;

export const groupsEditUserGroupInfoMutation = graphql`
  mutation groupsEditUserGroupInfoMutation(
    $identifier: String!
    $name: String!
    $description: String
  ) {
    updateUserGroupInfo(
      identifier: $identifier
      name: $name
      description: $description
    ) {
      slug
    }
  }
`;

export const groupsDeleteUserGroupMutation = graphql`
  mutation groupsDeleteUserGroupMutation($id: String!) {
    deleteUserGroup(userGroupIdentifier: $id)
  }
`;

export const settingsTeamSelectedGroupSlug = atom({
  key: 'settingsTeamSelectedGroupSlug',
  default: {}
});

export const removeGroupState = atom<Group | null>({
  key: 'removeGroupState',
  default: null
});

/**
 * null -> create a new group
 * Group -> edit an existing group
 * undefined -> modal is closed
 */
export const groupInModalState = atom<Group | null | undefined>({
  key: 'groupInModalState',
  default: undefined
});

export const groupsListPageInfoState = atom({
  key: 'groupsListPageInfoState',
  default: { page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE },
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf({
          page: Number(Router.query?.page || 1),
          pageSize: Number(Router.query?.pageSize || DEFAULT_PAGE_SIZE)
        });
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            pathname: GROUPS_PAGE,
            params: newValue,
            resetPage: false
          });
        }
      });
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const pageSize = Number(
          urlPram.get(PARAMS.PAGE_SIZE) || DEFAULT_PAGE_SIZE
        );
        const page = Number(urlPram.get(PARAMS.PAGE) || 1);
        setSelf({ page, pageSize });
      });
    }
  ]
});

export interface GroupsSearchExpression {
  fields: string[];
  term: string;
}

type GroupsSearchFields = groupsQuery.UserGroupSearchFields;

const defaultGroupFields: GroupsSearchFields[] = ['name', 'slug'];

export interface sortOptionType extends UserGroupOrderFieldsOrder {
  displayName: string;
}

export interface SortT {
  id: string;
  label: string;
  field: string;
  direction: string;
  displayName: string;
}

export const GROUPS_SORT_OPTIONS: sortOptionType[] = [
  {
    field: 'name',
    direction: 'ASC',
    displayName: 'Name A-Z'
  },
  {
    field: 'name',
    direction: 'DESC',
    displayName: 'Name Z-A'
  },
  {
    field: 'createdAt',
    direction: 'DESC',
    displayName: 'Newest'
  },
  {
    field: 'createdAt',
    direction: 'ASC',
    displayName: 'Oldest'
  }
];

export const groupSearchInputState = atom({
  key: 'groupSearchInput',
  default: '',
  effects: [
    ({ trigger, setSelf }) => {
      if (trigger == 'get') {
        const srch = Router.query?.search;
        if (srch) {
          setSelf(srch as string);
        } else {
          delete Router.query?.[PARAMS.SEARCH];
          Router.replace({
            pathname: GROUPS_PAGE,
            query: Router.query
          });
        }
      }
      Router.events.on('routeChangeComplete', () => {
        const queryString = window.location.search;
        const urlPram = new URLSearchParams(queryString);
        const searchParam = urlPram.get(PARAMS.SEARCH);
        if (searchParam) {
          setSelf(searchParam);
        }
      });
    }
  ]
});

export const groupSearchTermState: RecoilState<GroupsSearchExpression | null> =
  atom({
    key: 'groupSearchTermState',
    default: null,
    effects: [
      ({ trigger, onSet, setSelf, getPromise }) => {
        if (trigger == 'get') {
          setSelf(
            toSearchGroupFilter({
              term: Router.query?.search as string,
              fields: []
            })
          );
        }
        onSet(async (newValue, oldValue, isReset) => {
          // handle reset search input here
          if (isReset) {
            delete Router.query?.[PARAMS.SEARCH];
            const { pageSize } = await getPromise(groupsListPageInfoState);
            changeRoute({
              pathname: GROUPS_PAGE,
              params: {
                ...Router.query,
                ...{ page: 1, pageSize }
              }
            });
            return;
          }

          if (oldValue !== newValue && newValue?.term) {
            changeRoute({
              pathname: GROUPS_PAGE,
              params: { search: newValue.term }
            });
          }
        });
      }
    ]
  });

export const groupListSortState = atom({
  key: 'groupListSortState',
  default: GROUPS_SORT_OPTIONS[0],
  effects: [
    ({ trigger, onSet, setSelf }) => {
      if (trigger == 'get') {
        setSelf(getCurrentSortOption());
      }
      onSet((newValue, oldValue) => {
        if (newValue && newValue !== oldValue) {
          changeRoute({
            pathname: GROUPS_PAGE,
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
    GROUPS_SORT_OPTIONS.filter(({ field, direction }) => {
      return field === querySortField && direction === querySortDirection;
    })?.[0] || GROUPS_SORT_OPTIONS[0]
  );
};

export const toSearchGroupFilter = (search: GroupsSearchExpression) => {
  if (!search?.term) {
    return {
      fields: defaultGroupFields,
      term: ''
    };
  }
  const rawSearch = decodeURIComponent(search.term);

  const rawSplit = rawSearch.split(':');
  let fields = search.fields.length ? search.fields : defaultGroupFields;
  let term = rawSearch;

  if (rawSplit.length > 1) {
    let potentialFieldRaw = rawSplit[0];
    const potentialValue = rawSplit[1] as string;

    const potentialField = potentialFieldRaw as GroupsSearchFields;

    if (defaultGroupFields.includes(potentialField) && potentialValue) {
      fields = [potentialField];
      term = potentialValue;
    }
  }

  return {
    fields,
    term
  };
};

export const isGroupSearchActiveSelector = selector({
  key: 'isGroupSearchActiveSelector',
  get: ({ get }) => {
    const searchInput = get(groupSearchInputState);
    const isSearchActive = searchInput?.length > 0;

    return Boolean(isSearchActive);
  }
});
