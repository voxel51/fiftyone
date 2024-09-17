import { useCacheStore, useMutation, withSuspense } from '@fiftyone/hooks';
import { Dialog } from '@fiftyone/teams-components';
import {
  DATASET_SHARE_MODAL_INFO_CACHE_KEY,
  DatasetPermission,
  Group,
  manageDatasetGrantGroupAccessOpenState,
  manageDatasetSetDatasetGroupPermissionMutation
} from '@fiftyone/teams-state';
import { Stack } from '@mui/material';
import { capitalize } from 'lodash';
import { useRouter } from 'next/router';
import { Suspense, useState } from 'react';
import { useRecoilState } from 'recoil';
import GrantDatasetAccessTitle from './GrantDatasetAccessTitle';
import GroupInputSuggestion from './GroupInputSuggestion';
import ManageGroup from './ManageGroup';

function GrantGroupDatasetAccess() {
  const router = useRouter();
  const { slug: datasetIdentifier } = router.query;
  const [open, setOpen] = useRecoilState(
    manageDatasetGrantGroupAccessOpenState
  );
  const [group, setGroup] = useState<Group | null>(null);
  const [groupStatePermission, setGroupStatePermission] =
    useState<DatasetPermission>('VIEW');
  const [setGroupPermission, mutationInProgress] = useMutation(
    manageDatasetSetDatasetGroupPermissionMutation
  );
  const [_, setStale] = useCacheStore(DATASET_SHARE_MODAL_INFO_CACHE_KEY);

  function closeDialog() {
    setOpen(false);
    setGroup(null);
    setGroupStatePermission('VIEW');
  }

  const handleSubmitGroup = async () => {
    const { id, name, slug } = group as Group;
    const variables: any = {
      datasetIdentifier,
      permission: groupStatePermission,
      id: id
    };
    if (id) variables.id = id;

    setGroupPermission({
      successMessage: `Successfully granted special access on the dataset to group ${name}`,
      errorMessage: `Failed to grant special access to group ${name}`,
      variables,
      onCompleted() {
        if (id) {
          setStale(true);
          router.replace(router.asPath);
        }
        closeDialog();
      }
    });
  };

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      title={<GrantDatasetAccessTitle isGroup={true} />}
      fullWidth
      disableConfirmationButton={!group || mutationInProgress}
      confirmationButtonText="Grant access"
      loading={mutationInProgress}
      onConfirm={() => {
        group && handleSubmitGroup();
      }}
    >
      <Stack spacing={2}>
        {/* <Typography>Learn more about managing dataset access.</Typography> */}
        <Suspense>
          <GroupInputSuggestion group={group} onSelectGroup={setGroup} />
        </Suspense>
        {group && (
          <ManageGroup
            group={group}
            permission={groupStatePermission}
            cardProps={{ email: capitalize(group.description) }}
            onDelete={() => {
              setGroup(null);
            }}
            onPermissionChange={(permission: DatasetPermission) => {
              setGroupStatePermission(permission);
            }}
          />
        )}
      </Stack>
    </Dialog>
  );
}

export default withSuspense(GrantGroupDatasetAccess, () => null);
