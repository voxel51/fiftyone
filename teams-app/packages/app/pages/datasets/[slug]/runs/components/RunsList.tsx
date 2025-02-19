import {
  BasicTable,
  Box,
  EmptyState,
  Pagination,
  TableSkeleton,
  Timestamp,
} from "@fiftyone/teams-components";
import {
  autoRefreshRunsStatus,
  datasetBySlugQuery,
  runsPageFilterDatasetSelectionState,
  runsPageQuery,
  runsPageQueryDynamicVariables,
  runsPageQueryT,
  runsPageStatusQuery,
} from "@fiftyone/teams-state";
import {
  FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS_ENV_KEY,
  OPERATOR_RUN_STATES,
} from "@fiftyone/teams-state/src/constants";
import { Stack, Typography } from "@mui/material";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  usePreloadedQuery,
  useQueryLoader,
  fetchQuery,
  useRelayEnvironment,
} from "react-relay";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";
import useRefresher, { RUNS_STATUS_REFRESHER_ID } from "../utils/useRefresher";
import RunActions from "./RunActions";
import RunLabel from "./RunLabel";
import RunStatus from "./RunStatus";
import RunsPin from "./RunsPin";
import { useBooleanEnv } from "@fiftyone/hooks/src/common/useEnv";
import { useRouter } from "next/router";
import { useCurrentUser } from "@fiftyone/hooks";

const NON_FINAL_RUN_STATES = [
  OPERATOR_RUN_STATES.QUEUED,
  OPERATOR_RUN_STATES.SCHEDULED,
  OPERATOR_RUN_STATES.RUNNING,
];

function RunsListWithQuery(props) {
  const environment = useRelayEnvironment();
  const { queryRef, refresh, refreshStatus } = props;
  const result = usePreloadedQuery<runsPageQueryT>(runsPageQuery, queryRef);
  const [vars, setVars] = useRecoilState(runsPageQueryDynamicVariables);
  const setAutoRefresh = useSetRecoilState(autoRefreshRunsStatus);
  const [hovered, setHovered] = useState("");
  const [_, setRefresher] = useRefresher(RUNS_STATUS_REFRESHER_ID);
  const showOrchestrators = !useBooleanEnv(
    FIFTYONE_ALLOW_LEGACY_ORCHESTRATORS_ENV_KEY
  );
  const filterDatasetSelection = useRecoilValue(
    runsPageFilterDatasetSelectionState
  );

  const { query } = useRouter();
  const { slug: currentDatasetSlug } = query;
  const [user] = useCurrentUser();
  const isAdmin = user?.role === "ADMIN";

  const showRunsForAllDatasets = isAdmin;

  const { nodes, pageTotal } = result.delegatedOperationsPage;
  const hasRunningRuns = nodes.some((node) =>
    NON_FINAL_RUN_STATES.includes(node.runState)
  );

  useEffect(() => {
    setAutoRefresh(hasRunningRuns);
  }, [hasRunningRuns, setAutoRefresh]);
  useEffect(() => {
    setRefresher(refreshStatus);
  }, [refreshStatus, setRefresher]);

  const tableColumns = useMemo(() => {
    if (showRunsForAllDatasets) {
      return ["Operator", "Status", "Dataset", "Updated", "Run by", ""];
    }
    return ["Operator", "Status", "Updated", "Run by", ""];
  }, [showRunsForAllDatasets]);

  if (nodes.length === 0) return <EmptyState resource="runs" />;

  const runIdToDatasetId: Record<string, string> = {};
  const rows = nodes.map((node) => {
    const { id, operator, label, runBy, runState, pinned, status, datasetId } =
      node;
    runIdToDatasetId[id] = datasetId as string;
    const timestamp = node.updatedAt;
    const isHovering = hovered === id;
    const showProgress =
      status !== null && runState === OPERATOR_RUN_STATES.RUNNING;

    return {
      id,
      onClick: async (_, row) => {
        // TODO: change this to get datasetSlug from runs query when API is updated
        const data = await fetchQuery(environment, datasetBySlugQuery, {
          identifier: runIdToDatasetId[row.id],
        }).toPromise();
        const datasetSlug = data?.dataset?.slug;
        if (!datasetSlug) return;
        const url = `/datasets/${datasetSlug}/runs/${encodeURIComponent(
          row.id
        )}`;

        if (currentDatasetSlug === datasetSlug) {
          window.open(url, "_self");
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
      },
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
              priority={node.priority}
              maxPriority={5}
            />
          ),
        },
        ...(showRunsForAllDatasets
          ? [
              {
                id: `${id}-dataset`,
                value: node.datasetId,
              },
            ]
          : []),
        {
          id: `${id}-dataset`,
          value: "mock dataset name", // todo@im
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
      <BasicTable rows={rows} columns={tableColumns} />
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

  const loadQueryVariables = useMemo(
    () => ({
      ...dynamicVars,
      filter: { ...(dynamicVars.filter || {}) },
    }),
    [dynamicVars]
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
