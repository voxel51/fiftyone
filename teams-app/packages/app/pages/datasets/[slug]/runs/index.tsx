import { withPermissions } from '@fiftyone/hooks';
import { useBooleanEnv } from '@fiftyone/hooks/src/common/useEnv';
import { Box, TableSkeleton } from '@fiftyone/teams-components';
import { SidePanelLayout } from '@fiftyone/teams-components/src/layout';
import { VIEW_DATASET } from '@fiftyone/teams-state';
import { ENABLE_ORCHESTRATOR_REGISTRATION_ENV_KEY } from '@fiftyone/teams-state/src/constants';
import { Stack } from '@mui/material';
import { Suspense } from 'react';
import DatasetNavigation from '../components/navigation';
import Orchestrators from './components/Orchestrators';
import PinnedRuns from './components/PinnedRuns';
import RecentRuns from './components/RecentRuns';
import RunsFilterSortSearch from './components/RunsFilterSortSearch';
import RunsList from './components/RunsList';

function Runs() {
  const showOrchestrators = useBooleanEnv(
    ENABLE_ORCHESTRATOR_REGISTRATION_ENV_KEY
  );

  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <Box>
        <DatasetNavigation />
      </Box>
      <SidePanelLayout reverse containerProps={{ sx: { p: 2 }, spacing: 2 }}>
        <Stack spacing={2}>
          <PinnedRuns />
          <RecentRuns />
          {showOrchestrators && <Orchestrators />}
        </Stack>
        <Stack>
          <RunsFilterSortSearch />
          <RunsList />
        </Stack>
      </SidePanelLayout>
    </Suspense>
  );
}

export default withPermissions(Runs, [VIEW_DATASET], 'dataset', {
  getLayoutProps: () => ({ topNavProps: { noBorder: true } })
});

export { getServerSideProps } from 'lib/env';
