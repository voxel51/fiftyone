import {
  Box,
  Container,
  EmptyState,
  Pagination,
  SectionHeader
} from '@fiftyone/teams-components';
import {
  ROLLBACK_DATASET_TO_SNAPSHOT,
  historySnapshotsQuery,
  historySnapshotsQueryT,
  snapshotsPageState
} from '@fiftyone/teams-state';
import { LEARN_MORE_ABOUT_DATASET_SNAPSHOT_LINK } from '@fiftyone/teams-state/src/constants';
import { Timeline, timelineItemClasses } from '@mui/lab';
import { usePreloadedQuery } from 'react-relay';
import { useRecoilState } from 'recoil';
import Snapshot from './Snapshot';
import { SnapshotActionsModals } from './SnapshotActions';
import { useCurrentDatasetPermission } from '@fiftyone/hooks';

export default function PreviousSnapshots(props) {
  const { queryRef, refresh } = props;
  const history = usePreloadedQuery<historySnapshotsQueryT>(
    historySnapshotsQuery,
    queryRef
  );
  const [pageState, setPageState] = useRecoilState(snapshotsPageState);
  const canRollback = useCurrentDatasetPermission([
    ROLLBACK_DATASET_TO_SNAPSHOT
  ]);
  const rollback = canRollback
    ? ' or permanently roll your dataset back to '
    : ' ';

  const { nodes = [], pageTotal = 0 } = history.dataset?.snapshotsPage || {};
  const hasSnapshots = nodes.length > 0;

  return (
    <Box>
      <SectionHeader
        title="Previous snapshots"
        description={`You can browse${rollback}any previously saved snapshots.`}
        learnMoreLink={LEARN_MORE_ABOUT_DATASET_SNAPSHOT_LINK}
        learnMoreText="Learn more about dataset snapshot"
      />
      {hasSnapshots && (
        <Container>
          <Timeline
            sx={{
              [`& .${timelineItemClasses.root}:before`]: {
                flex: 0,
                padding: 0
              }
            }}
          >
            {nodes.map((node, i) => (
              <Snapshot
                key={node.id}
                {...node}
                last={i === nodes.length - 1}
                refresh={refresh}
              />
            ))}
          </Timeline>
        </Container>
      )}
      {!hasSnapshots && <EmptyState resource="snapshots" />}
      {hasSnapshots && (
        <Pagination
          count={pageTotal}
          page={pageState.page}
          onChange={(e, page) => {
            setPageState((state) => ({ ...state, page }));
          }}
          pageSize={pageState.pageSize}
          onPageSizeChange={(pageSize) => {
            setPageState((state) => ({ ...state, pageSize }));
          }}
          onManualPageChange={(page) => {
            setPageState((state) => ({ ...state, page }));
          }}
        />
      )}
      <SnapshotActionsModals refresh={refresh} />
    </Box>
  );
}
