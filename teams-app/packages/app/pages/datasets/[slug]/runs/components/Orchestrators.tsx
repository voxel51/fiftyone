import {
  Box,
  ColorCircle,
  DatasetHighlightsWidget,
  Timestamp
} from '@fiftyone/teams-components';
import {
  orchestratorDialogAtom,
  runsOrchestratorsQuery,
  runsOrchestratorsQueryT
} from '@fiftyone/teams-state';
import { INITIAL_ORCHESTRATORS_LIMIT } from '@fiftyone/teams-state/src/constants';
import { Button, Typography } from '@mui/material';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { usePreloadedQuery, useQueryLoader } from 'react-relay';
import { useSetRecoilState } from 'recoil';
import Orchestrator, { Subtitle } from './Orchestrator';

function OrchestratorsWithQuery(props) {
  const { queryRef, pageSize, setPageSize } = props;
  const result = usePreloadedQuery<runsOrchestratorsQueryT>(
    runsOrchestratorsQuery,
    queryRef
  );
  const setOrchestrator = useSetRecoilState(orchestratorDialogAtom);
  const { nodeTotal, nodes } = result.orchestratorsPage;

  const items = nodes.map((orchestrator) => {
    const {
      description,
      createdAt,
      deactivatedAt,
      orchestratorIdentifier,
      updatedAt
    } = orchestrator;

    return {
      title: description,
      subtitle: [<Subtitle {...orchestrator} />],
      Icon: (
        <ColorCircle
          title={deactivatedAt ? 'Inactive' : 'Available'}
          color={deactivatedAt ? 'gray' : 'green'}
          sx={{ mr: 1 }}
        />
      ),
      onClick() {
        setOrchestrator({
          description,
          id: orchestratorIdentifier,
          open: true,
          createdAt,
          deactivatedAt: deactivatedAt ?? '',
          updatedAt: updatedAt ?? ''
        });
      }
    };
  });
  const leftoverOrchestrators = nodeTotal - pageSize;

  return (
    <Box>
      <DatasetHighlightsWidget
        title="Orchestrators"
        items={items}
        emptyTitle="No orchestrators registered yet"
      />
      {leftoverOrchestrators > 0 && (
        <Button
          size="small"
          color="secondary"
          sx={{ ml: 1 }}
          onClick={() => {
            setPageSize(nodeTotal);
          }}
        >
          +{leftoverOrchestrators} more
        </Button>
      )}
      <Orchestrator />
    </Box>
  );
}

export default function Orchestrators() {
  const [queryRef, loadQuery] = useQueryLoader<runsOrchestratorsQueryT>(
    runsOrchestratorsQuery
  );
  const [pageSize, setPageSize] = useState(INITIAL_ORCHESTRATORS_LIMIT);

  const loadQueryOptions = useMemo(() => ({ page: 1, pageSize }), [pageSize]);

  useEffect(() => {
    loadQuery(loadQueryOptions);
  }, [loadQuery, loadQueryOptions]);

  if (!queryRef) return <OrchestratorsSkeleton />;

  return (
    <Suspense fallback={<OrchestratorsSkeleton />}>
      <OrchestratorsWithQuery
        queryRef={queryRef}
        setPageSize={(pageSize: number) => {
          setPageSize(pageSize);
        }}
        pageSize={pageSize}
      />
    </Suspense>
  );
}

function OrchestratorsSkeleton() {
  return <DatasetHighlightsWidget items={[]} title="Orchestrators" loading />;
}
