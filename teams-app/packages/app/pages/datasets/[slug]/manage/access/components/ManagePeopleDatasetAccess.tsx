import { useMutation, useSecurityRole } from '@fiftyone/hooks';
import dynamic from 'next/dynamic';
import {
  Box,
  EmptyState,
  TableContainer,
  TableSkeleton
} from '@fiftyone/teams-components';
import {
  accessFrag,
  DatasetPermission,
  groupFrag,
  manageDatasetGetAccessPageState,
  manageDatasetRemoveDatasetGroupPermissionMutation,
  manageDatasetRemoveDatasetUserPermissionMutation,
  manageDatasetSetDatasetGroupPermissionMutation,
  manageDatasetSetDatasetUserPermissionMutation,
  manageDatasetTargetsWithAccessSelector,
  userFrag
} from '@fiftyone/teams-state';
import TableBody from '@mui/material/TableBody';
import { useRouter } from 'next/router';
import { useFragment } from 'react-relay/hooks';
import { useRecoilState, useRecoilStateLoadable } from 'recoil';
import { memo, useState } from 'react';

// Dynamically import Pagination and other components
const Pagination = dynamic(() => import('@fiftyone/teams-components').then(mod => mod.Pagination), { ssr: false });
const Table = dynamic(() => import('@mui/material/Table'), { ssr: false });
const ManageGroupUserTableRow = dynamic(() => import('./ManageGroupUserTableRow'), { ssr: false });


export function isGroup(targetRef: any): boolean {
  return targetRef.__typename === 'Group';
}

export function isTargetGroup(target: any): boolean {
  return Boolean(target.slug);
}

export default function ManagePeopleDatasetAccess() {
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const [targetsWithAccess, _] = useRecoilStateLoadable(
    manageDatasetTargetsWithAccessSelector(datasetIdentifier)
  );
  const [itemsLoading, setItemsLoading] = useState<Record<string, boolean>>({});
  const [itemsPermission, setItemsPermission] = useState<
    Record<string, DatasetPermission>
  >({});

  const [pageState, setPageState] = useRecoilState(
    manageDatasetGetAccessPageState
  );
  const [setDatasetUserPermission] = useMutation(
    manageDatasetSetDatasetUserPermissionMutation
  );
  const [setDatasetGroupPermission] = useMutation(
    manageDatasetSetDatasetGroupPermissionMutation
  );
  const [removeDatasetUserPermission] = useMutation(
    manageDatasetRemoveDatasetUserPermissionMutation
  );
  const [removeDatasetGroupPermission] = useMutation(
    manageDatasetRemoveDatasetGroupPermissionMutation
  );
  const { maxDatasetPermission } = useSecurityRole();

  const { contents, state } = targetsWithAccess;
  if (state === 'hasError') return <h1>Failed to fetch users with access.</h1>;
  if (state === 'loading') return <TableSkeleton />;
  const { pageTotal, nodes: targets } = contents;

  const AccessItem = memo(({ accessRef }) => {
    let data = useFragment(accessFrag, accessRef);
    switch (data.__typename) {
      case 'DatasetUser':
        return <UserItem userRef={data} />;
      case 'DatasetUserGroup':
        return <GroupItem groupRef={data} />;
      default:
        console.error('unexpected typename:', data.__typename);
        return null;
    }
  });

  const UserItem = memo(({userRef}) => {{
    const userFragment = useFragment(userFrag, userRef);
    const user = {
      id: userFragment.userId,
      ...userFragment,
      userPermission:
        itemsPermission?.[userFragment.userId] || userFragment.userPermission
    };

    return (
      <ManageGroupUserTableRow
        key={user.id}
        target={user}
        isGroup={false}
        permission={user.userPermission}
        maxDatasetPermission={maxDatasetPermission(user.role)}
        permissionSelectionProps={{
          defaultValue: 'VIEW',
          loading: itemsLoading?.[user.id],
          disabled: itemsLoading?.[user.id]
        }}
        onPermissionChange={(newPermission) => {
          setItemsLoading({ ...itemsLoading, [user.id]: true });
          setDatasetUserPermission({
            successMessage:
              'Successfully updated special access on the dataset for user',
            errorMessage:
              'Failed to update special access on the dataset for user',
            variables: {
              datasetIdentifier,
              userId: user.id,
              permission: newPermission
            },
            onCompleted() {
              setItemsLoading({ ...itemsLoading, [user.id]: false });
              setItemsPermission({
                ...itemsPermission,
                [user.id]: newPermission
              });
            },
            onError(error) {
              setItemsLoading({ ...itemsLoading, [user.id]: false });
              console.error('Mutation error:', error);
            }
          });
        }}
        onDelete={() => {
          removeDatasetUserPermission({
            successMessage:
              'Successfully removed special access on the dataset for user',
            errorMessage:
              'Failed to remove special access on the dataset for user',
            variables: { datasetIdentifier, userId: user.id },
            onCompleted() {
              router.replace(router.asPath);
            },
            onError(error) {
              console.error('Mutation error:', error);
            }
          });
        }}
      />
    );
  }})

  const GroupItem = memo(({ groupRef }) => {
    const groupFragment = useFragment(groupFrag, groupRef);
    const group = {
      id: groupFragment.groupId,
      ...groupFragment,
      permission:
        itemsPermission?.[groupFragment.groupId] || groupFragment.permission
    };

    return (
      <ManageGroupUserTableRow
        maxDatasetPermission={null}
        key={group.id}
        isGroup
        target={group}
        permission={group.permission}
        permissionSelectionProps={{
          defaultValue: 'VIEW',
          loading: itemsLoading?.[group.id],
          disabled: itemsLoading?.[group.id]
        }}
        onPermissionChange={(newPermission) => {
          setItemsLoading({ ...itemsLoading, [group.id]: true });
          setItemsPermission({
            ...itemsPermission,
            [group.id]: newPermission
          });
          setDatasetGroupPermission({
            successMessage:
              'Successfully updated special access on the dataset for group',
            errorMessage:
              'Failed to update special access on the dataset for group',
            variables: {
              datasetIdentifier,
              id: group.id,
              permission: newPermission
            },
            onCompleted() {
              setItemsLoading({ ...itemsLoading, [group.id]: false });
              router.replace(router.asPath);
            },
            onError(error) {
              setItemsLoading({ ...itemsLoading, [group.id]: false });
              console.error('Mutation error:', error);
            }
          });
        }}
        onDelete={() => {
          removeDatasetGroupPermission({
            successMessage:
              'Successfully removed special access on the dataset for group',
            errorMessage:
              'Failed to remove special access on the dataset for group',
            variables: { datasetIdentifier, groupIdentifier: group.id },
            onCompleted() {
              router.replace(router.asPath);
            },
            onError(error) {
              console.error('Mutation error:', error);
            }
          });
        }}
      />
    );
  });


  return (
    <Box>
      {targets.length > 0 && (
        <Box>
          <TableContainer>
            <Table>
              <TableBody>
                {/* @ts-ignore */}
                {targets.map((targetRef, index) => {
                  return <AccessItem accessRef={targetRef} key={index} />;
                })}
              </TableBody>
            </Table>
          </TableContainer>
          <Pagination
            count={pageTotal}
            page={pageState.page}
            onChange={(e, page) => {
              setPageState({ ...pageState, page });
            }}
            pageSize={pageState.pageSize}
            onPageSizeChange={(pageSize) => {
              setPageState({ ...pageState, pageSize });
            }}
            onManualPageChange={(page) => {
              setPageState({ ...pageState, page });
            }}
          />
        </Box>
      )}
      {targets.length === 0 && (
        <EmptyState resource="people and groups with special access" />
      )}
    </Box>
  );
}
