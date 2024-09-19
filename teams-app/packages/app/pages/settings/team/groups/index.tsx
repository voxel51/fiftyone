import { useEnv, withPermissions } from '@fiftyone/hooks';
import {
  Box,
  UserGroupModal,
  DeleteGroupModal,
  EmptyGroups,
  SectionHeader,
  SettingsLayout,
  WithTooltip
} from '@fiftyone/teams-components';
import {
  GROUPS_SORT_OPTIONS,
  MANAGE_ORGANIZATION,
  groupInModalState,
  groupsListPageInfoState,
  groupsListQuery,
  groupsListQueryT,
  mainTitleSelector
} from '@fiftyone/teams-state';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT_ENV_KEY,
  LEARN_MORE_ABOUT_ROLES_LINK,
  MANUAL_GROUP_MGMT_DISABLED_TEXT
} from '@fiftyone/teams-state/src/constants';
import { Add as AddIcon } from '@mui/icons-material';
import { Button, Tooltip } from '@mui/material';
import withRelay from 'lib/withRelay';
import { useEffect } from 'react';
import { usePreloadedQuery } from 'react-relay';
import { useRecoilState, useSetRecoilState } from 'recoil';
import { RelayProps } from 'relay-nextjs';

import ControllBar from '../components/Groups/Controllbar';
import GroupsTable from '../components/Groups/GroupsTable';
import { useBooleanEnv } from '@fiftyone/hooks/src/common/useEnv';

function TeamGroups({ preloadedQuery }: RelayProps<{}, groupsListQueryT>) {
  const enableManualGroupMgmt = useBooleanEnv(
    FEATURE_FLAG_ENABLE_MANUAL_USER_GROUP_MANAGEMENT_ENV_KEY,
    true
  );

  const setPageTitle = useSetRecoilState(mainTitleSelector);
  useEffect(() => {
    setPageTitle('Settings');
  }, []);
  const setGroupInModal = useSetRecoilState(groupInModalState);
  const [pageInfo, setPageInfo] = useRecoilState(groupsListPageInfoState);
  const { userGroupsPage } = usePreloadedQuery<groupsListQueryT>(
    groupsListQuery,
    preloadedQuery
  );
  const { nodes: groups, pageTotal, nodeTotal } = userGroupsPage || {};
  const showEmptyPage = !nodeTotal;

  return (
    <SettingsLayout>
      <Box>
        <SectionHeader
          title={`Groups${nodeTotal ? ` (${nodeTotal})` : ''}`}
          description="These are the groups that have been created for your organization."
          learnMoreLink={LEARN_MORE_ABOUT_ROLES_LINK + '#groups'}
          learnMoreText="Learn more about groups"
        >
          <WithTooltip
            disabled={!enableManualGroupMgmt}
            text={MANUAL_GROUP_MGMT_DISABLED_TEXT}
          >
            <Button
              startIcon={<AddIcon />}
              onClick={() => enableManualGroupMgmt && setGroupInModal(null)}
              variant="contained"
              disabled={!enableManualGroupMgmt}
            >
              Create Group
            </Button>
          </WithTooltip>
        </SectionHeader>
        {showEmptyPage && <EmptyGroups />}
        {!showEmptyPage && <ControllBar />}
        {!showEmptyPage && (
          <GroupsTable
            groups={groups}
            pageTotal={pageTotal}
            readOnly={!enableManualGroupMgmt}
            onPageChange={(page: number) => {
              setPageInfo({ ...pageInfo, page });
            }}
            onPageSizeChange={(pageSize: number) => {
              setPageInfo({ ...pageInfo, pageSize });
            }}
            {...pageInfo}
          />
        )}
      </Box>
      <UserGroupModal />
      <DeleteGroupModal />
    </SettingsLayout>
  );
}

export default withRelay(
  withPermissions(TeamGroups, [MANAGE_ORGANIZATION], 'user'),
  groupsListQuery,
  {},
  {
    page: DEFAULT_PAGE,
    pageSize: DEFAULT_PAGE_SIZE,
    order: {
      field: GROUPS_SORT_OPTIONS[0].field,
      direction: GROUPS_SORT_OPTIONS[0].direction
    }
  }
);
