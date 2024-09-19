import {
  useCacheStore,
  useCurrentDataset,
  useEnv,
  useMutation
} from '@fiftyone/hooks';
import { OverflowMenu } from '@fiftyone/teams-components';
import {
  ARCHIVE_DATASET_SNAPSHOT,
  CLONE_DATASET_SNAPSHOT,
  DELETE_DATASET_SNAPSHOT,
  Dataset,
  ROLLBACK_DATASET_TO_SNAPSHOT,
  SNAPSHOT_BANNER_QUERY_CACHE_KEY,
  VIEW_DATASET,
  cloneSnapshotState,
  deleteSnapshotState,
  historyOffloadDatasetSnapshotMutation,
  historyOffloadDatasetSnapshotMutationT,
  openSnapshotLocallyState,
  rollbackSnapshotState
} from '@fiftyone/teams-state';
import { ArchiveOutlined } from '@mui/icons-material';
import CachedOutlinedIcon from '@mui/icons-material/CachedOutlined';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DeleteOutlineOutlinedIcon from '@mui/icons-material/DeleteOutlineOutlined';
import DesktopWindowsOutlinedIcon from '@mui/icons-material/DesktopWindowsOutlined';
import { Typography } from '@mui/material';
import { useSetRecoilState } from 'recoil';
import CloneSnapshot from './CloneSnapshot';
import DeleteSnapshot from './DeleteSnapshot';
import OpenSnapshotLocally from './OpenSnapshotLocally';
import RollbackSnapshot from './RollbackSnapshot';
import { useCallback, useState } from 'react';
import { FIFTYONE_SNAPSHOTS_ARCHIVE_PATH_ENV_KEY } from '@fiftyone/teams-state/src/constants';

export function SnapshotActionsMenu(props: SnapshotActionsMenuProps) {
  const { name, id, createdBy, createdAt, loadStatus, refresh, onArchive } =
    props;
  const [archiving, setArchiving] = useState(false);
  const setOpenSnapshotLocallyState = useSetRecoilState(
    openSnapshotLocallyState
  );
  const setDeleteSnapshotState = useSetRecoilState(deleteSnapshotState);
  const setCloneSnapshotState = useSetRecoilState(cloneSnapshotState);
  const setRollbackSnapshotState = useSetRecoilState(rollbackSnapshotState);
  const { name: datasetIdentifier } = useCurrentDataset() as Dataset;
  const [archive] = useMutation<historyOffloadDatasetSnapshotMutationT>(
    historyOffloadDatasetSnapshotMutation
  );
  const [_, setStale] = useCacheStore(SNAPSHOT_BANNER_QUERY_CACHE_KEY);
  const handleArchive = useCallback(
    (state: ArchiveState) => {
      setArchiving(state === 'loading');
      if (onArchive) onArchive(state);
    },
    [onArchive]
  );
  const canArchive = Boolean(useEnv(FIFTYONE_SNAPSHOTS_ARCHIVE_PATH_ENV_KEY));
  const isLoaded = loadStatus === 'LOADED' && !archiving;

  let archiveTitle;
  const isArchived = isLoaded === false;
  const disableArchive = canArchive === false;
  if (disableArchive) {
    archiveTitle = 'Snapshot archiving is not enabled';
  } else if (isArchived) {
    archiveTitle = 'Snapshot is already archived';
  }

  return (
    <OverflowMenu
      items={[
        {
          primaryText: 'View snapshot locally',
          IconComponent: <DesktopWindowsOutlinedIcon />,
          onClick: () => setOpenSnapshotLocallyState({ open: true, id, name }),
          disabled: !isLoaded,
          title: !isLoaded
            ? 'Cannot view archived snapshot locally'
            : undefined,
          permission: { dataset: [VIEW_DATASET] }
        },
        {
          primaryText: 'Clone to new dataset',
          IconComponent: <ContentCopyOutlinedIcon />,
          onClick: () => setCloneSnapshotState({ open: true, id, name }),
          disabled: !isLoaded,
          title: !isLoaded
            ? 'Cannot clone archived snapshot to new dataset'
            : undefined,
          permission: {
            user: [CLONE_DATASET_SNAPSHOT],
            label: 'clone snapshot to new dataset'
          }
        },
        {
          primaryText: 'Archive snapshot',
          IconComponent: <ArchiveOutlined />,
          onClick: () => {
            handleArchive('loading');
            archive({
              variables: { datasetIdentifier, snapshotName: name },
              successMessage: 'Successfully archived snapshot ' + name,
              errorMessage: 'Failed to archive snapshot ' + name,
              onSuccess() {
                setStale(true);
                handleArchive('success');
                if (refresh) refresh();
              },
              onError() {
                handleArchive('error');
              }
            });
          },
          disabled: disableArchive || isArchived,
          title: archiveTitle,
          permission: { dataset: [ARCHIVE_DATASET_SNAPSHOT] }
        },
        {
          primaryText: 'Rollback to this snapshot',
          IconComponent: <CachedOutlinedIcon />,
          onClick: () =>
            setRollbackSnapshotState({
              open: true,
              id,
              name,
              author: createdBy.name,
              since: createdAt
            }),
          disabled: !isLoaded,
          title: !isLoaded ? 'Cannot rollback to archived snapshot' : undefined,
          permission: {
            dataset: [ROLLBACK_DATASET_TO_SNAPSHOT],
            label: 'rollback dataset to snapshot'
          }
        },
        {
          primaryText: <Typography color="error">Delete snapshot</Typography>,
          IconComponent: <DeleteOutlineOutlinedIcon color="error" />,
          onClick: () => setDeleteSnapshotState({ open: true, id, name }),
          permission: {
            dataset: [DELETE_DATASET_SNAPSHOT],
            label: 'delete snapshot'
          }
        }
      ]}
    />
  );
}
export function SnapshotActionsModals(props: SnapshotActionsModalsPropsType) {
  const { refresh, onDelete, onRollback } = props;
  return (
    <>
      <OpenSnapshotLocally />
      <CloneSnapshot />
      <RollbackSnapshot refresh={refresh} onRollback={onRollback} />
      <DeleteSnapshot refresh={refresh} onDelete={onDelete} />
    </>
  );
}

// todo: move components out of pages directory
export default function SnapshotActions() {
  return null;
}

export type SnapshotActionsMenuProps = {
  id: string;
  name: string;
  createdBy: {
    name: string;
  };
  createdAt: number;
  refresh?: () => void;
  loadStatus: 'LOADED' | 'LOADING' | 'UNLOADED';
  onArchive?: (state: ArchiveState) => void;
};

type ArchiveState = 'loading' | 'success' | 'error';

type SnapshotActionsModalsPropsType = {
  onDelete?: () => void;
  onRollback?: () => void;
  refresh?: () => void;
};
