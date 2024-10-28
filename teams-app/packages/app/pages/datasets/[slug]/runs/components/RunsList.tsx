import { useCurrentDataset } from "@fiftyone/hooks";
import {
  BasicTable,
  Box,
  EmptyState,
  Pagination,
  TableSkeleton,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  Dataset,
  autoRefreshRunsStatus,
  runsPageQuery,
  runsPageQueryDynamicVariables,
  runsPageQueryT,
  runsPageStatusQuery,
} from "@fiftyone/teams-state";
import {
  ENABLE_ORCHESTRATOR_REGISTRATION_ENV_KEY,
  OPERATOR_RUN_STATES,
} from "@fiftyone/teams-state/src/constants";
import { Stack, Typography } from "@mui/material";
import { useRouter } from "next/router";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePreloadedQuery, useQueryLoader } from "react-relay";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import getTimestamp from "../utils/getTimestamp";
import useRefresher, { RUNS_STATUS_REFRESHER_ID } from "../utils/useRefresher";
import RunActions from "./RunActions";
import RunLabel from "./RunLabel";
import RunStatus from "./RunStatus";
import RunsPin from "./RunsPin";
import { useBooleanEnv } from "@fiftyone/hooks/src/common/useEnv";

function RunsListWithQuery(props) {
  const { queryRef, refresh, refreshStatus } = props;
  const { asPath } = useRouter();
  const result = usePreloadedQuery<runsPageQueryT>(runsPageQuery, queryRef);
  const [vars, setVars] = useRecoilState(runsPageQueryDynamicVariables);
  const setAutoRefresh = useSetRecoilState(autoRefreshRunsStatus);
  const [hovered, setHovered] = useState("");
  const [_, setRefresher] = useRefresher(RUNS_STATUS_REFRESHER_ID);
  const showOrchestrators = useBooleanEnv(
    ENABLE_ORCHESTRATOR_REGISTRATION_ENV_KEY
  );

  const { nodes, pageTotal } = result.delegatedOperationsPage;
  const hasRunningRuns = nodes.some(
    (node) => node.runState === OPERATOR_RUN_STATES.RUNNING
  );

  useEffect(() => {
    setAutoRefresh(hasRunningRuns);
  }, [hasRunningRuns, setAutoRefresh]);
  useEffect(() => {
    setRefresher(refreshStatus);
  }, [refreshStatus, setRefresher]);

  if (nodes.length === 0) return <EmptyState resource="runs" />;

  const rows = nodes.map((node) => {
    const { id, operator, label, runBy, runState, pinned, status } = node;
    const timestamp = getTimestamp(node);
    const isHovering = hovered === id;
    const showProgress =
      status !== null && runState === OPERATOR_RUN_STATES.RUNNING;

    return {
      id,
      link: `${asPath}/${id}`,
      onHover: (e, row, hovered) => {
        if (hovered) setHovered(row.id);
        else setHovered("");
      },
      cells: [
        {
          id: `${id}-label`,
          Component: (
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <RunLabel
                  id={id}
                  label={label || operator}
                  isHovering={isHovering}
                  pinned={Boolean(pinned)}
                />
                <RunsPin
                  pinned={Boolean(pinned)}
                  isHovering={isHovering}
                  id={id}
                />
              </Stack>
              <Typography variant="body1" color="text.tertiary">
                {operator}
              </Typography>
            </Box>
          ),
        },
        {
          id: `${id}-status`,
          Component: (
            <RunStatus
              status={runState}
              progress={showProgress ? status : undefined}
            />
          ),
        },
        {
          id: `${id}-timestamp`,
          Component: <Timestamp timestamp={timestamp} />,
        },
        {
          id: `${id}-creator`,
          value: runBy?.name,
        },
        {
          id: `${id}-actions`,
          Component: (
            <RunActions
              refresh={refresh}
              {...node}
              hideViewInOrchestrator={!showOrchestrators}
            />
          ),
        },
      ],
    };
  });

  return (
    <Stack>
      <BasicTable rows={rows} />
      <Pagination
        page={vars.page}
        count={pageTotal}
        onChange={(e, page) => {
          setVars((vars) => ({ ...vars, page }));
        }}
        pageSize={vars.pageSize}
        onPageSizeChange={(pageSize) => {
          setVars((vars) => ({ ...vars, pageSize }));
        }}
        onManualPageChange={(page) => {
          setVars((vars) => ({ ...vars, page }));
        }}
      />
    </Stack>
  );
}

export default function RunsList() {
  const [queryRef, loadQuery] = useQueryLoader(runsPageQuery);
  const [statusQueryRef, loadStatusQuery] = useQueryLoader(runsPageStatusQuery);
  const dynamicVars = useRecoilValue(runsPageQueryDynamicVariables);
  const dataset = useCurrentDataset() as Dataset;
  const { id } = dataset;

  const loadQueryVariables = useMemo(
    () => ({
      ...dynamicVars,
      filter: { ...(dynamicVars.filter || {}), datasetIdentifier: { eq: id } },
    }),
    [dynamicVars, id]
  );

  const refresh = useCallback(() => {
    loadQuery(loadQueryVariables, { fetchPolicy: "store-and-network" });
  }, [loadQuery, loadQueryVariables]);

  const refreshStatus = useCallback(() => {
    loadStatusQuery(
      { ...loadQueryVariables, pageSize: loadQueryVariables?.pageSize + 1 },
      { fetchPolicy: "store-and-network" }
    );
  }, [loadStatusQuery, loadQueryVariables]);

  useEffect(() => {
    loadQuery(loadQueryVariables, { fetchPolicy: "store-and-network" });
  }, [loadQuery, loadQueryVariables]);

  if (!queryRef) return <TableSkeleton rows={dynamicVars.pageSize} />;

  return (
    <Suspense fallback={<TableSkeleton rows={dynamicVars.pageSize} />}>
      <RunsListWithQuery
        queryRef={queryRef}
        refresh={refresh}
        refreshStatus={refreshStatus}
        statusQueryRef={statusQueryRef}
      />
    </Suspense>
  );
}
